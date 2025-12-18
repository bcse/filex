use axum::{
    Router,
    extract::DefaultBodyLimit,
    middleware,
    routing::{delete, get, post},
};
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use filex_backend::{
    api::{self, AppState, AuthState},
    config::Config,
    db,
    services::{FilesystemService, IndexerService, SearchService},
    version,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "filex_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env();

    let version_info = version::current();
    tracing::info!(
        version = version_info.version,
        commit = version_info.git_commit,
        built_at = version_info.built_at,
        "Starting Filex backend"
    );
    tracing::info!("Root path: {:?}", config.root_path);
    tracing::info!("Database: {:?}", config.database_path);
    tracing::info!(
        "Authentication: {}",
        if config.auth.enabled {
            "enabled"
        } else {
            "disabled"
        }
    );

    // Ensure database directory exists
    if let Some(parent) = config.database_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Initialize database
    let db_url = format!("sqlite:{}?mode=rwc", config.database_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    db::init_db(&pool).await?;
    tracing::info!("Database initialized");

    // Initialize services
    let fs = FilesystemService::new(config.root_path.clone());

    // Initialize search service and populate index from database
    let search_service = Arc::new(SearchService::new());
    if let Err(e) = search_service.rebuild_from_db(&pool).await {
        tracing::warn!("Initial search index build failed: {}", e);
    }

    let indexer = Arc::new(IndexerService::new(
        pool.clone(),
        &config,
        Some(search_service.clone()),
    ));

    // Initialize auth state
    let auth_state = Arc::new(AuthState::new(config.auth.clone()));

    // Start background indexer if enabled
    if config.enable_indexer {
        let indexer_clone = indexer.clone();
        let interval = config.index_interval_secs;
        tokio::spawn(async move {
            indexer_clone.start_background_loop(interval).await;
        });
    }

    // Shared state
    let app_state = Arc::new(AppState {
        fs,
        pool,
        search: search_service,
    });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Protected routes that require authentication
    let protected_routes = Router::new()
        .route("/api/browse", get(api::browse::list_directory))
        .route("/api/tree", get(api::browse::get_tree))
        .route("/api/search", get(api::search::search_files))
        .route("/api/files/mkdir", post(api::files::create_directory))
        .route("/api/files/rename", post(api::files::rename))
        .route("/api/files/copy", post(api::files::copy_entry))
        .route("/api/files/move", post(api::files::move_entry))
        .route("/api/files/delete", delete(api::files::delete))
        .route("/api/files/download", get(api::files::download))
        .route("/api/files/upload", post(api::files::upload_root))
        .route("/api/files/upload/", post(api::files::upload_root))
        .route("/api/files/upload/*path", post(api::files::upload))
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            auth_state.clone(),
            api::auth::auth_middleware,
        ));

    // Protected routes that require indexer state
    let protected_index_routes = Router::new()
        .route("/api/index/status", get(api::system::index_status))
        .route("/api/index/trigger", post(api::system::trigger_index))
        .with_state(indexer.clone())
        .route_layer(middleware::from_fn_with_state(
            auth_state.clone(),
            api::auth::auth_middleware,
        ));

    // Auth routes (not protected)
    let auth_routes = Router::new()
        .route("/api/auth/login", post(api::auth::login))
        .route("/api/auth/logout", post(api::auth::logout))
        .route("/api/auth/status", get(api::auth::auth_status))
        .with_state(auth_state.clone());

    // Static file serving for frontend
    let static_path = config.static_path.clone();
    let index_file = static_path.join("index.html");

    let serve_dir = ServeDir::new(&static_path).not_found_service(ServeFile::new(&index_file));

    // Health route with app state for database checks (not protected)
    let health_route = Router::new()
        .route("/api/health", get(api::system::health))
        .with_state(app_state.clone());

    // Build router
    let app = Router::new()
        .merge(health_route)
        .merge(auth_routes)
        .merge(protected_routes)
        .merge(protected_index_routes)
        .fallback_service(serve_dir)
        .layer(DefaultBodyLimit::disable())
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start server
    let addr = config.server_addr();
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
