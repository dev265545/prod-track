//! SQLite backend for ProdTrack (id + JSON data per store).
//! Tables must match lib/db/schema.ts STORES (same names).

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Must match lib/db/schema.ts DB_VERSION. Bump when adding migrations.
const CURRENT_SCHEMA_VERSION: u32 = 12;

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

/// Must match lib/db/indexes.ts INDEXES: `(store, index name, key path fields)`.
///
/// Duplicated rather than shared because this process cannot read the
/// TypeScript, and because it is what makes `db_get_by_index` safe: the store,
/// the index and the number of bound values are all checked against this table
/// before a single identifier is interpolated into SQL. The frontend sends key
/// values as bound parameters and nothing else.
const INDEXES: &[(&str, &str, &[&str])] = &[
    ("productions", "by_date", &["date"]),
    ("productions", "by_employee", &["employeeId"]),
    ("productions", "by_item", &["itemId"]),
    ("productions", "employee_date", &["employeeId", "date"]),
    ("advances", "by_employee", &["employeeId"]),
    ("advances", "by_date", &["date"]),
    ("advances", "employee_date", &["employeeId", "date"]),
    ("advance_deductions", "by_employee", &["employeeId"]),
    (
        "advance_deductions",
        "employee_period",
        &["employeeId", "periodFrom"],
    ),
    ("salary_records", "by_employee", &["employeeId"]),
    ("salary_records", "by_month", &["month"]),
    ("attendance", "by_date", &["date"]),
    ("attendance", "employee_date", &["employeeId", "date"]),
    ("inventory_movements", "by_item", &["itemId"]),
    ("audit_log", "by_timestamp", &["timestamp"]),
];

fn index_fields(store: &str, index: &str) -> Result<&'static [&'static str], String> {
    INDEXES
        .iter()
        .find(|(s, i, _)| *s == store && *i == index)
        .map(|(_, _, fields)| *fields)
        .ok_or_else(|| format!("Unknown index {}.{}", store, index))
}

/// Every distinct key-path field of `store`, in declaration order.
fn index_columns(store: &str) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for (s, _, fields) in INDEXES {
        if *s != store {
            continue;
        }
        for f in *fields {
            if !out.contains(f) {
                out.push(f);
            }
        }
    }
    out
}

/// Promote every index key path to a VIRTUAL generated column with a real
/// SQLite index over it. See the long note in lib/db/indexes.ts: the expression
/// reproduces `extractKey` exactly (only a JSON *string* yields a key, so a
/// missing, null, numeric or non-JSON value is NULL = absent from the index).
///
/// This is the migration, and it is deliberately not keyed to a schema version:
/// a virtual column stores nothing, so adding it is an instant catalogue change
/// that rewrites no rows and can lose no data, and running it on every open is
/// also what fixes a database that arrived by restore rather than by upgrade.
/// `table_xinfo` rather than `table_info` — the latter hides generated columns
/// and this would then try to add them again on every open.
fn ensure_index_schema(conn: &Connection) -> Result<(), String> {
    let mut stores: Vec<&str> = Vec::new();
    for (s, _, _) in INDEXES {
        if !stores.contains(s) {
            stores.push(s);
        }
    }
    for store in stores {
        let mut existing: Vec<String> = Vec::new();
        {
            let mut stmt = conn
                .prepare(&format!("PRAGMA table_xinfo({})", store))
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| e.to_string())?;
            for row in rows {
                existing.push(row.map_err(|e| e.to_string())?);
            }
        }
        for field in index_columns(store) {
            let column = format!("k_{}", field);
            if existing.iter().any(|c| c == &column) {
                continue;
            }
            conn.execute(
                &format!(
                    "ALTER TABLE {} ADD COLUMN {} TEXT GENERATED ALWAYS AS \
                     (CASE WHEN json_valid(data) AND json_type(data, '$.{}') = 'text' \
                     THEN json_extract(data, '$.{}') END) VIRTUAL",
                    store, column, field, field
                ),
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        for (s, index, fields) in INDEXES {
            if *s != store {
                continue;
            }
            let mut cols: Vec<String> = fields.iter().map(|f| format!("k_{}", f)).collect();
            cols.push("id".to_string());
            conn.execute(
                &format!(
                    "CREATE INDEX IF NOT EXISTS idx_{}_{} ON {} ({})",
                    store,
                    index,
                    store,
                    cols.join(", ")
                ),
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// The `WHERE` body for an inclusive index range, and its bound values.
///
/// Row-value comparison gives the element-wise lexicographic ordering a
/// compound IndexedDB key has. The `IS NOT NULL` guards are not decoration:
/// SQLite short-circuits a row-value comparison on a decisive earlier element,
/// so without them `('e1', NULL) >= ('e0', '9999')` would be TRUE and a row
/// missing `date` would be returned from a compound range IndexedDB omits.
fn index_where(
    store: &str,
    index: &str,
    lower: &[String],
    upper: &[String],
) -> Result<(String, Vec<String>), String> {
    let fields = index_fields(store, index)?;
    if lower.len() != fields.len() || upper.len() != fields.len() {
        return Err(format!(
            "Index {}.{} takes {} key part(s)",
            store,
            index,
            fields.len()
        ));
    }
    let cols: Vec<String> = fields.iter().map(|f| format!("k_{}", f)).collect();
    let tuple = format!("({})", cols.join(", "));
    let placeholders = format!(
        "({})",
        cols.iter().map(|_| "?").collect::<Vec<_>>().join(", ")
    );
    let mut clauses: Vec<String> = cols.iter().map(|c| format!("{} IS NOT NULL", c)).collect();
    clauses.push(format!("{} >= {}", tuple, placeholders));
    clauses.push(format!("{} <= {}", tuple, placeholders));
    let mut params: Vec<String> = Vec::new();
    params.extend_from_slice(lower);
    params.extend_from_slice(upper);
    if cols.len() > 1 {
        // Implied by the row-value bounds, but it is what lets SQLite seek on
        // the leading column instead of walking the index.
        clauses.push(format!("{} >= ?", cols[0]));
        clauses.push(format!("{} <= ?", cols[0]));
        params.push(lower[0].clone());
        params.push(upper[0].clone());
    }
    Ok((clauses.join(" AND "), params))
}

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
            // lib/db/indexes.ts). Nothing to do here — the matching SQLite
            // columns and indexes are created by `ensure_index_schema`, which
            // runs on every open rather than on a version step, because a
            // database can also arrive by restore or by being copied in.
        }
        12 => {
            // Reserved: adds the IndexedDB `audit_log.by_timestamp` index (see
            // lib/db/indexes.ts). As above — `ensure_index_schema` owns it.
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
        ensure_index_schema(&conn)?;
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

/// `IDBIndex.getAll(IDBKeyRange.bound(lower, upper))` — inclusive both ends —
/// as a real index seek. `descending` reverses the whole ordered range before
/// `offset`/`limit` are applied, matching `applyIndexReadOptions`; `limit < 0`
/// means no limit. Order is index columns then `id`, which is exactly
/// `sortByIndexOrder` — the tie-break payroll depends on.
#[tauri::command]
pub fn db_get_by_index(
    state: State<DbState>,
    store: String,
    index: String,
    lower: Vec<String>,
    upper: Vec<String>,
    descending: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<serde_json::Value>, String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    let fields = index_fields(&store, &index)?;
    let (where_sql, key_params) = index_where(&store, &index, &lower, &upper)?;
    let direction = if descending { " DESC" } else { "" };
    let order_by = fields
        .iter()
        .map(|f| format!("k_{}{}", f, direction))
        .chain(std::iter::once(format!("id{}", direction)))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT data FROM {} WHERE {} ORDER BY {} LIMIT ? OFFSET ?",
        store, where_sql, order_by
    );
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut params: Vec<rusqlite::types::Value> = key_params
            .iter()
            .map(|v| rusqlite::types::Value::Text(v.clone()))
            .collect();
        params.push(rusqlite::types::Value::Integer(limit));
        params.push(rusqlite::types::Value::Integer(offset.max(0)));
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params), |row| {
                row.get::<_, String>(0)
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

/// Rows in the same range, counted without reading or parsing any of them.
#[tauri::command]
pub fn db_count_by_index(
    state: State<DbState>,
    store: String,
    index: String,
    lower: Vec<String>,
    upper: Vec<String>,
) -> Result<i64, String> {
    if !TABLES.contains(&store.as_str()) {
        return Err(format!("Unknown store: {}", store));
    }
    let (where_sql, key_params) = index_where(&store, &index, &lower, &upper)?;
    let sql = format!("SELECT COUNT(*) FROM {} WHERE {}", store, where_sql);
    let params: Vec<rusqlite::types::Value> = key_params
        .into_iter()
        .map(rusqlite::types::Value::Text)
        .collect();
    state.with_conn(|conn| {
        conn.query_row(&sql, rusqlite::params_from_iter(params), |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|e| e.to_string())
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
