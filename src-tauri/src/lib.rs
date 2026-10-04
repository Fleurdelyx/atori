use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

const COMPANION_PORT: u16 = 8790;

/// ATRI companion lifecycle: the local yt-dlp helper behind the ADD URL
/// panel. Spawned automatically on launch so `npm run companion` is only
/// needed when driving the web build standalone; an already-running
/// companion (standalone or orphaned from a crash) is adopted, not respawned,
/// and the spawned copy is killed on app exit.

fn companion_reachable() -> bool {
    TcpStream::connect(("127.0.0.1", COMPANION_PORT)).is_ok()
}

/// The companion ships as project sources: locate it by walking up from the
/// exe (dev layout: src-tauri/target/debug → project root). Installed builds
/// don't carry it, so ADD URL stays offline there.
fn find_companion_script() -> Option<PathBuf> {
    let mut dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    for _ in 0..5 {
        let candidate = dir.join("companion").join("index.mjs");
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

fn spawn_companion() -> Option<Child> {
    if companion_reachable() {
        println!("[atori] companion already running on :{COMPANION_PORT}: adopting it");
        return None;
    }
    let script = find_companion_script()?;
    let mut cmd = Command::new("node");
    cmd.arg(&script);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flash
    }
    match cmd.spawn() {
        Ok(child) => {
            println!("[atori] companion spawned (node {})", script.display());
            Some(child)
        }
        Err(e) => {
            println!("[atori] companion spawn failed ({e}): ADD URL stays offline");
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Mutex::new(spawn_companion()))
        // the taskbar/titlebar icon follows the WINDOW icon at runtime: don't
        // rely on the embedded exe resource, which Windows caches aggressively.
        // Use the 32px frame: tao builds the small HICON at the image's own
        // size, so the full 128px design gets GDI-shrunk to caption size and
        // turns to mud (grooves/sparkle vanish, disc goes dark)
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let icon = tauri::include_image!("icons/32x32.png");
                let _ = win.set_icon(icon);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building atori")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mut child) = app
                    .state::<Mutex<Option<Child>>>()
                    .lock()
                    .ok()
                    .and_then(|mut guard| guard.take())
                {
                    let _ = child.kill();
                }
            }
        });
}
