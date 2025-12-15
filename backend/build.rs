use std::process::Command;

fn main() {
    // Package version from Cargo
    let pkg_version = std::env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=APP_VERSION={}", pkg_version);

    // Build number from CI (e.g., BUILD_NUMBER). Defaults to "dev" for local builds.
    let build_number = std::env::var("BUILD_NUMBER").unwrap_or_else(|_| "dev".to_string());
    println!("cargo:rustc-env=APP_BUILD_NUMBER={}", build_number);

    // Git commit sha (short). Allow override via GIT_COMMIT_SHA for reproducible builds.
    let git_commit = std::env::var("GIT_COMMIT_SHA").ok().or_else(get_git_sha);
    println!(
        "cargo:rustc-env=APP_COMMIT_SHA={}",
        git_commit.unwrap_or_else(|| "unknown".to_string())
    );

    // Build timestamp in RFC3339 UTC
    let built_at = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=APP_BUILT_AT={}", built_at);
}

fn get_git_sha() -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let sha = String::from_utf8(output.stdout).ok()?;
    let trimmed = sha.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
