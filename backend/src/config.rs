use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    /// Root directory to serve files from
    pub root_path: PathBuf,

    /// Server host
    pub host: String,

    /// Server port
    pub port: u16,

    /// SQLite database path
    pub database_path: PathBuf,

    /// Whether to start background indexer
    pub enable_indexer: bool,

    /// Indexer scan interval in seconds
    pub index_interval_secs: u64,

    /// Static files directory (frontend build)
    pub static_path: PathBuf,

    /// Authentication settings
    pub auth: AuthConfig,
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// Whether authentication is enabled
    pub enabled: bool,

    /// Password for authentication (hashed with SHA-256)
    pub password: Option<String>,

    /// Session timeout in seconds (default: 24 hours)
    pub session_timeout_secs: u64,

    /// Cookie name for session token
    pub cookie_name: String,
}

impl Config {
    pub fn from_env() -> Self {
        let auth_enabled = std::env::var("FM_AUTH_ENABLED")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        let auth_password = std::env::var("FM_AUTH_PASSWORD").ok();

        // Warn if auth is enabled but no password is set
        if auth_enabled && auth_password.is_none() {
            tracing::warn!(
                "FM_AUTH_ENABLED is true but FM_AUTH_PASSWORD is not set. Authentication disabled."
            );
        }

        Self {
            root_path: std::env::var("FM_ROOT_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/data")),

            host: std::env::var("FM_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),

            port: std::env::var("FM_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),

            database_path: std::env::var("FM_DATABASE_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/app/data/filemanager.db")),

            enable_indexer: std::env::var("FM_ENABLE_INDEXER")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(true),

            index_interval_secs: std::env::var("FM_INDEX_INTERVAL")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(300), // 5 minutes

            static_path: std::env::var("FM_STATIC_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("./static")),

            auth: AuthConfig {
                enabled: auth_enabled && auth_password.is_some(),
                password: auth_password,
                session_timeout_secs: std::env::var("FM_SESSION_TIMEOUT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(86400), // 24 hours
                cookie_name: std::env::var("FM_SESSION_COOKIE")
                    .unwrap_or_else(|_| "fm_session".to_string()),
            },
        }
    }

    pub fn server_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}
