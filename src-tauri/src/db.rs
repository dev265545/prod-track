//! SQLite backend for ProdTrack (id + JSON data per store).
//! Tables must match lib/db/schema.ts STORES (same names).

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Must match lib/db/schema.ts DB_VERSION. Bump when adding migrations.
const CURRENT_SCHEMA_VERSION: u32 = 6;

const TABLES: &[&str] = &[
    "_metadata",
    "items",
    "employees",
    "productions",
    "advances",
    "advance_deductions",
    "shifts",
    "salary_records",
    "factory_holidays",
    "attendance",
    "sunday_categories",
];

fn get_schema_version(conn: &Connection) -> Result<u32, String> {
    let mut stmt = conn
        .prepare("SELECT data FROM _metadata WHERE id = '_schema'")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let data: String = row.get(0).map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        if let Some(n) = v.get("schemaVersion").and_then(|x| x.as_u64()) {
            return Ok(n as u32);
        }
    }
    Ok(0)
}

fn set_schema_version(conn: &Connection, version: u32) -> Result<(), String> {
    let data = serde_json::json!({ "id": "_schema", "schemaVersion": version }).to_string();
    conn.execute(
        "INSERT OR REPLACE INTO _metadata (id, data) VALUES ('_schema', ?1)",
        rusqlite::params![data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn run_migration(_conn: &Connection, to_version: u32) -> Result<(), String> {
    match to_version {
        5 => {
            // Reserved: app metadata row `_app` (password hash, onboarding) lives in `_metadata`.
            // Older DBs only had `_schema`; no ALTER needed.
        }
        6 => {
            // Reserved: sunday_categories table is auto-created via TABLES list.
        }
        _ => {}
    }
    Ok(())
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version = get_schema_version(conn)?;
    if version == 0 {
        set_schema_version(conn, CURRENT_SCHEMA_VERSION)?;
        return Ok(());
    }
    let mut v = version;
    while v < CURRENT_SCHEMA_VERSION {
        v += 1;
        run_migration(conn, v)?;
        set_schema_version(conn, v)?;
    }
    Ok(())
}

pub struct DbState {
    pub path: PathBuf,
    pub conn: Mutex<Option<Connection>>,
}

impl DbState {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            conn: Mutex::new(None),
        }
    }

    fn get_conn(&self) -> Result<Connection, String> {
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = guard.take() {
            drop(guard);
            return Ok(conn);
        }
        drop(guard);
        let conn = Connection::open(&self.path).map_err(|e| e.to_string())?;
        for table in TABLES {
            conn.execute(
                &format!(
                    "CREATE TABLE IF NOT EXISTS {} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)",
                    table
                ),
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        run_migrations(&conn)?;
        Ok(conn)
    }

    fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let conn = self.get_conn()?;
        let result = f(&conn)?;
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        *guard = Some(conn);
        Ok(result)
    }
}

#[tauri::command]
pub fn init_db(state: State<DbState>) -> Result<(), String> {
    state.with_conn(|_| Ok(()))
}

/// Return the path to the SQLite database file (for display in Settings).
#[tauri::command]
pub fn db_path(state: State<DbState>) -> Result<String, String> {
    Ok(state.path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn db_get_all(state: State<DbState>, store: String) -> Result<Vec<serde_json::Value>, String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    state.with_conn(|conn| {
        let mut stmt = conn
            .prepare(&format!("SELECT data FROM {} ORDER BY id", store))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let data: String = row.get(0)?;
                Ok(data)
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            let data: String = row.map_err(|e| e.to_string())?;
            let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            out.push(v);
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn db_get(
    state: State<DbState>,
    store: String,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    state.with_conn(|conn| {
        let mut stmt = conn
            .prepare(&format!("SELECT data FROM {} WHERE id = ?1", store))
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![id])
            .map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let data: String = row.get(0).map_err(|e| e.to_string())?;
            let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            return Ok(Some(v));
        }
        Ok(None)
    })
}

#[tauri::command]
pub fn db_put(
    state: State<DbState>,
    store: String,
    record: serde_json::Value,
) -> Result<(), String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    let id = record
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Record must have id")?
        .to_string();
    let data = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    state.with_conn(|conn| {
        conn.execute(
            &format!(
                "INSERT OR REPLACE INTO {} (id, data) VALUES (?1, ?2)",
                store
            ),
            rusqlite::params![id, data],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn db_remove(state: State<DbState>, store: String, id: String) -> Result<(), String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    state.with_conn(|conn| {
        conn.execute(
            &format!("DELETE FROM {} WHERE id = ?1", store),
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn db_clear(state: State<DbState>, store: String) -> Result<(), String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    state.with_conn(|conn| {
        conn.execute(&format!("DELETE FROM {}", store), [])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Copy current DB file to target path (export).
#[tauri::command]
pub fn db_export(state: State<DbState>, target_path: String) -> Result<(), String> {
    std::fs::copy(&state.path, &target_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace current DB with file at path (import). Drops connection so next use reopens.
#[tauri::command]
pub fn db_import(state: State<DbState>, source_path: String) -> Result<(), String> {
    let mut guard = state.conn.lock().map_err(|e| e.to_string())?;
    *guard = None;
    drop(guard);
    std::fs::copy(&source_path, &state.path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Show save dialog and export DB to selected path. No frontend dialog package needed.
#[tauri::command]
pub fn db_export_with_dialog(app: AppHandle, state: State<DbState>) -> Result<(), String> {
    let path = app
        .dialog()
        .file()
        .add_filter("SQLite database", &["db", "sqlite", "sqlite3"])
        .set_file_name("prodtrack.db")
        .blocking_save_file();
    let target = path
        .and_then(|fp| fp.into_path().ok())
        .ok_or("Save cancelled or invalid path")?;
    std::fs::copy(&state.path, &target).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write HTML to a temp file for printing. Returns the file path.
#[tauri::command]
pub fn write_temp_html(html: String) -> Result<String, String> {
    let mut temp_dir = std::env::temp_dir();
    temp_dir.push(format!("prodtrack-print-{}.html", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()));
    std::fs::write(&temp_dir, html).map_err(|e| e.to_string())?;
    Ok(temp_dir.to_string_lossy().into_owned())
}

/// Show open dialog and import DB from selected file. No frontend dialog package needed.
#[tauri::command]
pub fn db_import_with_dialog(app: AppHandle, state: State<DbState>) -> Result<(), String> {
    let path = app
        .dialog()
        .file()
        .add_filter("SQLite database", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file();
    let source = path
        .and_then(|fp| fp.into_path().ok())
        .ok_or("Import cancelled or invalid path")?;
    let mut guard = state.conn.lock().map_err(|e| e.to_string())?;
    *guard = None;
    drop(guard);
    std::fs::copy(&source, &state.path).map_err(|e| e.to_string())?;
    Ok(())
}
