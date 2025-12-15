use serde::Serialize;

pub const VERSION: &str = env!("APP_VERSION");
pub const BUILD_NUMBER: &str = env!("APP_BUILD_NUMBER");
pub const GIT_COMMIT: &str = env!("APP_COMMIT_SHA");
pub const BUILT_AT: &str = env!("APP_BUILT_AT");

#[derive(Debug, Serialize)]
pub struct VersionInfo {
    pub version: &'static str,
    pub build_number: &'static str,
    pub git_commit: &'static str,
    pub built_at: &'static str,
}

pub fn current() -> VersionInfo {
    VersionInfo {
        version: VERSION,
        build_number: BUILD_NUMBER,
        git_commit: GIT_COMMIT,
        built_at: BUILT_AT,
    }
}
