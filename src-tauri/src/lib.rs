mod db;

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
      fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
      let db_path: PathBuf = app_data.join("prodtrack.db");
      app.manage(db::DbState::new(db_path));

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      db::init_db,
      db::db_get_all,
      db::db_get,
      db::db_put,
      db::db_remove,
      db::db_clear,
      db::db_export,
      db::db_import,
      db::db_export_with_dialog,
      db::db_import_with_dialog,
      db::db_path,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
