use axum::{
    Router,
    routing::{delete, get, post},
};
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use filemanager_backend::{
    api::{self, AppState},
    config::Config,
    db,
    services::{FilesystemService, IndexerService},
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "filemanager_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env();

    tracing::info!("Starting FileManager backend");
    tracing::info!("Root path: {:?}", config.root_path);
    tracing::info!("Database: {:?}", config.database_path);

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
    let indexer = Arc::new(IndexerService::new(pool.clone(), &config));

    // Start background indexer if enabled
    if config.enable_indexer {
        let indexer_clone = indexer.clone();
        let interval = config.index_interval_secs;
        tokio::spawn(async move {
            indexer_clone.start_background_loop(interval).await;
        });
    }

    // Shared state
    let app_state = Arc::new(AppState { fs, pool });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Routes that use the main application state
    let app_routes = Router::new()
        .route("/api/browse", get(api::browse::list_directory))
        .route("/api/tree", get(api::browse::get_tree))
        .route("/api/search", get(api::search::search_files))
        .route("/api/files/mkdir", post(api::files::create_directory))
        .route("/api/files/rename", post(api::files::rename))
        .route("/api/files/copy", post(api::files::copy_entry))
        .route("/api/files/move", post(api::files::move_entry))
        .route("/api/files/delete", delete(api::files::delete))
        .route("/api/files/download", get(api::files::download))
        .route("/api/files/upload/*path", post(api::files::upload))
        .with_state(app_state.clone());

    // Routes that require indexer state
    let index_routes = Router::new()
        .route("/api/index/status", get(api::system::index_status))
        .route("/api/index/trigger", post(api::system::trigger_index))
        .with_state(indexer.clone());

    // Static file serving for frontend
    let static_path = config.static_path.clone();
    let index_file = static_path.join("index.html");

    let serve_dir = ServeDir::new(&static_path).not_found_service(ServeFile::new(&index_file));

    // Build router
    let app = Router::new()
        .route("/api/health", get(api::system::health))
        .merge(app_routes)
        .merge(index_routes)
        .fallback_service(serve_dir)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start server
    let addr = config.server_addr();
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
