use tauri::Emitter;
#[cfg(debug_assertions)]
use tauri::Manager;

#[cfg(target_os = "macos")]
use std::sync::OnceLock;

#[cfg(target_os = "macos")]
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

#[cfg(target_os = "macos")]
type NavigationCallback = extern "C" fn(i32);

#[cfg(target_os = "macos")]
extern "C" {
    fn filex_quick_look_with_callback(
        paths_json: *const std::os::raw::c_char,
        callback: NavigationCallback,
    ) -> bool;
    fn filex_quick_look_refresh(paths_json: *const std::os::raw::c_char) -> bool;
    fn filex_quick_look_close();
    fn filex_quick_look_is_visible() -> bool;
}

#[cfg(target_os = "macos")]
extern "C" fn navigation_callback(direction: i32) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("quick-look-navigate", direction);
    }
}

#[tauri::command]
fn quick_look(paths: Vec<String>) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;

        if paths.is_empty() {
            return Ok(false);
        }

        let paths_json = serde_json::to_string(&paths)
            .map_err(|error| format!("failed to serialize paths: {error}"))?;
        let c_paths = CString::new(paths_json)
            .map_err(|error| format!("invalid paths for Quick Look: {error}"))?;
        let opened =
            unsafe { filex_quick_look_with_callback(c_paths.as_ptr(), navigation_callback) };
        Ok(opened)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = paths;
        Ok(false)
    }
}

#[tauri::command]
fn quick_look_refresh(paths: Option<Vec<String>>) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;
        use std::ptr;

        let c_paths = match paths {
            Some(p) if !p.is_empty() => {
                let paths_json = serde_json::to_string(&p)
                    .map_err(|error| format!("failed to serialize paths: {error}"))?;
                Some(
                    CString::new(paths_json)
                        .map_err(|error| format!("invalid paths for Quick Look: {error}"))?,
                )
            }
            _ => None,
        };

        let paths_ptr = c_paths.as_ref().map_or(ptr::null(), |s| s.as_ptr());
        let refreshed = unsafe { filex_quick_look_refresh(paths_ptr) };
        Ok(refreshed)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = paths;
        Ok(false)
    }
}

#[tauri::command]
fn quick_look_close() {
    #[cfg(target_os = "macos")]
    unsafe {
        filex_quick_look_close()
    }
}

#[tauri::command]
fn quick_look_is_visible() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { filex_quick_look_is_visible() }
    }

    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command]
fn local_path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            local_path_exists,
            quick_look,
            quick_look_refresh,
            quick_look_close,
            quick_look_is_visible
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = APP_HANDLE.set(app.handle().clone());
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
