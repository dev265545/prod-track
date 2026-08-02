//! SQLite backend for ProdTrack (id + JSON data per store).
//! Tables must match lib/db/schema.ts STORES (same names).

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Must match lib/db/schema.ts DB_VERSION. Bump when adding migrations.
const CURRENT_SCHEMA_VERSION: u32 = 11;

const TABLES: &[&str] = &[
    "_metadata",
    "items",
    "employees",
    "productions",
    "advances",
    "advance_deductions",
    "shifts",
    "salary_records",
    "salary_sheet_overrides",
    "factory_holidays",
    "attendance",
    "sunday_categories",
    "operator_national_holidays",
    "machines",
    "item_combos",
    "inventory_items",
    "inventory_movements",
    "audit_log",
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
        7 => {
            // Reserved: salary_sheet_overrides table is auto-created via TABLES list.
        }
        8 => {
            // Reserved: operator_national_holidays, machines, item_combos auto-created via TABLES list, no ALTER needed (schema-less JSON blob tables)
        }
        9 => {
            // Reserved: inventory_items, inventory_movements auto-created via TABLES list, no ALTER needed (schema-less JSON blob tables)
        }
        10 => {
            // Reserved: audit_log auto-created via TABLES list, no ALTER needed
            // (schema-less id/data JSON blob table, same shape as every other store).
        }
        11 => {
            // Reserved: adds IndexedDB indexes on attendance/advances (see
            // lib/db/indexes.ts). Nothing to do here — rows are JSON blobs in
            // an (id, data) table, so SQLite has no column to index.
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

// ---------------------------------------------------------------------------
// Automatic backups (desktop only)
//
// The web/portable build cannot write a file without a click, so unattended
// copies exist here and nowhere else. The owner picks a folder once (a USB
// stick, a second drive, a sync folder); after that every backup is a plain
// file write with no dialog.
//
// `VACUUM INTO` rather than `fs::copy`: the app holds the database open, and a
// byte copy of a live SQLite file can catch it mid-write. VACUUM INTO asks
// SQLite itself for a consistent copy, so the backup is always openable.
// ---------------------------------------------------------------------------

const BACKUP_PREFIX: &str = "prodtrack-backup-";
const BACKUP_SUFFIX: &str = ".db";

#[derive(serde::Serialize)]
pub struct BackupWriteResult {
    pub path: String,
    pub file_name: String,
    pub bytes: u64,
    /// File names deleted by the keep-N rule, oldest first.
    pub pruned: Vec<String>,
    /// How many backup files remain in the folder.
    pub kept: usize,
}

#[derive(serde::Serialize)]
pub struct BackupVerifyResult {
    pub ok: bool,
    pub error: Option<String>,
    pub schema_version: u32,
    pub rows: u64,
    pub tables: usize,
    pub bytes: u64,
}

/// Ask once for the folder every later backup is written into.
#[tauri::command]
pub fn backup_pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked
        .and_then(|fp| fp.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned()))
}

fn escape_sql_literal(value: &str) -> String {
    value.replace('\'', "''")
}

/// `stamp` comes from the UI so the file name carries the owner's local time.
/// Anything outside `[A-Za-z0-9-_]` is rejected rather than escaped: the value
/// ends up in a file name and in SQL, and there is no reason for it to be
/// anything but digits and dashes.
fn sanitize_stamp(stamp: &str) -> Result<String, String> {
    if stamp.is_empty() || stamp.len() > 40 {
        return Err("Bad backup name".to_string());
    }
    if !stamp
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Bad backup name".to_string());
    }
    Ok(stamp.to_string())
}

fn list_backup_files(folder: &std::path::Path) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with(BACKUP_PREFIX) && name.ends_with(BACKUP_SUFFIX) {
                names.push(name);
            }
        }
    }
    // Names embed a sortable timestamp, so lexicographic order is time order.
    names.sort();
    names
}

/// Write one timestamped copy into `folder`, then keep only the newest `keep`.
#[tauri::command]
pub fn backup_write(
    state: State<DbState>,
    folder: String,
    keep: u32,
    stamp: String,
) -> Result<BackupWriteResult, String> {
    let stamp = sanitize_stamp(&stamp)?;
    let dir = PathBuf::from(&folder);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut file_name = format!("{}{}{}", BACKUP_PREFIX, stamp, BACKUP_SUFFIX);
    let mut target = dir.join(&file_name);
    let mut attempt = 2;
    while target.exists() && attempt < 100 {
        file_name = format!("{}{}-{}{}", BACKUP_PREFIX, stamp, attempt, BACKUP_SUFFIX);
        target = dir.join(&file_name);
        attempt += 1;
    }

    let target_sql = escape_sql_literal(&target.to_string_lossy());
    state.with_conn(|conn| {
        conn.execute(&format!("VACUUM INTO '{}'", target_sql), [])
            .map_err(|e| e.to_string())?;
        Ok(())
    })?;

    let bytes = std::fs::metadata(&target)
        .map(|m| m.len())
        .unwrap_or_default();

    // Prune oldest first, never touching the file just written.
    let mut pruned: Vec<String> = Vec::new();
    let existing = list_backup_files(&dir);
    let keep = keep.max(1) as usize;
    if existing.len() > keep {
        for name in existing.iter().take(existing.len() - keep) {
            if name == &file_name {
                continue;
            }
            if std::fs::remove_file(dir.join(name)).is_ok() {
                pruned.push(name.clone());
            }
        }
    }
    let kept = list_backup_files(&dir).len();

    Ok(BackupWriteResult {
        path: target.to_string_lossy().into_owned(),
        file_name,
        bytes,
        pruned,
        kept,
    })
}

/// Open a backup file read-only and report what is inside it.
///
/// Read-only and on a copy: checking a backup can never disturb the live
/// database, so the owner can confirm a copy is good while the original is
/// still fine.
#[tauri::command]
pub fn backup_verify(path: String) -> Result<BackupVerifyResult, String> {
    let bytes = std::fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or_default();
    let conn = match Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(conn) => conn,
        Err(e) => {
            return Ok(BackupVerifyResult {
                ok: false,
                error: Some(e.to_string()),
                schema_version: 0,
                rows: 0,
                tables: 0,
                bytes,
            })
        }
    };

    let integrity: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .unwrap_or_else(|e| e.to_string());
    if integrity != "ok" {
        return Ok(BackupVerifyResult {
            ok: false,
            error: Some(integrity),
            schema_version: 0,
            rows: 0,
            tables: 0,
            bytes,
        });
    }

    let mut rows: u64 = 0;
    let mut tables: usize = 0;
    for table in TABLES {
        let count: Result<i64, _> =
            conn.query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| {
                row.get(0)
            });
        if let Ok(n) = count {
            tables += 1;
            rows += n.max(0) as u64;
        }
    }

    let schema_version = get_schema_version(&conn).unwrap_or(0);
    if tables == 0 {
        return Ok(BackupVerifyResult {
            ok: false,
            error: Some("This file has no ProdTrack data in it.".to_string()),
            schema_version,
            rows,
            tables,
            bytes,
        });
    }
    if schema_version > CURRENT_SCHEMA_VERSION {
        return Ok(BackupVerifyResult {
            ok: false,
            error: Some("This copy was made by a newer version of ProdTrack.".to_string()),
            schema_version,
            rows,
            tables,
            bytes,
        });
    }

    Ok(BackupVerifyResult {
        ok: true,
        error: None,
        schema_version,
        rows,
        tables,
        bytes,
    })
}

/// Pick an existing backup file to check. Separate from `db_import_with_dialog`
/// so choosing a file to *verify* can never turn into a restore.
#[tauri::command]
pub fn backup_pick_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("ProdTrack copy", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file();
    Ok(picked
        .and_then(|fp| fp.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned()))
}
