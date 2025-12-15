use axum::{
    Json,
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::config::AuthConfig;

/// Session token to expiry time mapping
pub type SessionStore = Arc<RwLock<HashMap<String, Instant>>>;

/// Create a new session store
pub fn new_session_store() -> SessionStore {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Auth state shared across handlers
#[derive(Clone)]
pub struct AuthState {
    pub config: AuthConfig,
    pub sessions: SessionStore,
}

impl AuthState {
    pub fn new(config: AuthConfig) -> Self {
        Self {
            config,
            sessions: new_session_store(),
        }
    }

    /// Verify password against stored hash
    pub fn verify_password(&self, password: &str) -> bool {
        match &self.config.password {
            Some(stored_password) => stored_password == password,
            None => false,
        }
    }

    /// Generate a new session token
    pub fn generate_token() -> String {
        // Use a UUID v4 directly for 122 bits of randomness; no additional hashing needed
        uuid::Uuid::new_v4().as_simple().to_string()
    }

    /// Create a new session and return the token
    pub async fn create_session(&self) -> String {
        let token = Self::generate_token();
        let expiry = Instant::now() + Duration::from_secs(self.config.session_timeout_secs);

        let mut sessions = self.sessions.write().await;
        sessions.insert(token.clone(), expiry);

        // Clean up expired sessions while we have the lock
        sessions.retain(|_, exp| *exp > Instant::now());

        token
    }

    /// Validate a session token
    pub async fn validate_session(&self, token: &str) -> bool {
        let sessions = self.sessions.read().await;
        if let Some(expiry) = sessions.get(token) {
            *expiry > Instant::now()
        } else {
            false
        }
    }

    /// Invalidate a session
    pub async fn invalidate_session(&self, token: &str) {
        let mut sessions = self.sessions.write().await;
        sessions.remove(token);
    }
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub auth_required: bool,
}

/// Login endpoint
pub async fn login(
    State(auth): State<Arc<AuthState>>,
    jar: CookieJar,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    if !auth.config.enabled {
        return (
            jar,
            Json(LoginResponse {
                success: true,
                error: None,
            }),
        )
            .into_response();
    }

    if auth.verify_password(&req.password) {
        let token = auth.create_session().await;

        // Create a session cookie
        let mut cookie = Cookie::new(auth.config.cookie_name.clone(), token);
        cookie.set_path("/");
        cookie.set_http_only(true);
        cookie.set_same_site(SameSite::Lax);
        // Set max age in seconds
        cookie.set_max_age(time::Duration::seconds(
            auth.config.session_timeout_secs as i64,
        ));

        let jar = jar.add(cookie);

        (
            jar,
            Json(LoginResponse {
                success: true,
                error: None,
            }),
        )
            .into_response()
    } else {
        let mut response = (
            jar,
            Json(LoginResponse {
                success: false,
                error: Some("Invalid password".to_string()),
            }),
        )
            .into_response();
        *response.status_mut() = StatusCode::UNAUTHORIZED;
        response
    }
}

/// Logout endpoint
pub async fn logout(State(auth): State<Arc<AuthState>>, jar: CookieJar) -> impl IntoResponse {
    // Get token from cookie and invalidate session
    if let Some(cookie) = jar.get(&auth.config.cookie_name) {
        auth.invalidate_session(cookie.value()).await;
    }

    // Remove the cookie by setting it to expire immediately
    let mut cookie = Cookie::new(auth.config.cookie_name.clone(), "");
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_max_age(time::Duration::ZERO);

    let jar = jar.remove(cookie);

    (
        jar,
        Json(LoginResponse {
            success: true,
            error: None,
        }),
    )
}

/// Check authentication status
pub async fn auth_status(
    State(auth): State<Arc<AuthState>>,
    jar: CookieJar,
) -> Json<AuthStatusResponse> {
    if !auth.config.enabled {
        return Json(AuthStatusResponse {
            authenticated: true,
            auth_required: false,
        });
    }

    let authenticated = if let Some(cookie) = jar.get(&auth.config.cookie_name) {
        auth.validate_session(cookie.value()).await
    } else {
        false
    };

    Json(AuthStatusResponse {
        authenticated,
        auth_required: true,
    })
}

/// Auth middleware - checks for valid session on protected routes
pub async fn auth_middleware(
    State(auth): State<Arc<AuthState>>,
    jar: CookieJar,
    request: Request<Body>,
    next: Next,
) -> Response {
    // If auth is not enabled, allow all requests
    if !auth.config.enabled {
        return next.run(request).await;
    }

    // Check for valid session cookie
    if let Some(cookie) = jar.get(&auth.config.cookie_name) {
        if auth.validate_session(cookie.value()).await {
            return next.run(request).await;
        }
    }

    // No valid session - return 401
    (StatusCode::UNAUTHORIZED, "Authentication required").into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
        middleware,
        routing::get,
    };
    use std::sync::Arc;
    use tower::ServiceExt;

    fn auth_config(enabled: bool) -> AuthConfig {
        AuthConfig {
            enabled,
            password: if enabled {
                Some("secret".to_string())
            } else {
                None
            },
            session_timeout_secs: 60,
            cookie_name: "fm_session".to_string(),
        }
    }

    fn app_with_auth(state: Arc<AuthState>) -> Router {
        Router::new()
            .route("/protected", get(|| async { StatusCode::OK }))
            .with_state(state.clone())
            .layer(middleware::from_fn_with_state(state, auth_middleware))
    }

    #[tokio::test]
    async fn middleware_allows_valid_session() {
        let state = Arc::new(AuthState::new(auth_config(true)));
        let cookie_name = state.config.cookie_name.clone();
        let token = state.create_session().await;

        let app = app_with_auth(state.clone());
        let request = Request::builder()
            .method("GET")
            .uri("/protected")
            .header("cookie", format!("{}={}", cookie_name, token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_missing_session() {
        let state = Arc::new(AuthState::new(auth_config(true)));
        let app = app_with_auth(state);

        let request = Request::builder()
            .method("GET")
            .uri("/protected")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_bypasses_when_disabled() {
        let state = Arc::new(AuthState::new(auth_config(false)));
        let app = app_with_auth(state);

        let request = Request::builder()
            .method("GET")
            .uri("/protected")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
