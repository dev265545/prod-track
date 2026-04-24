/**
 * Shared sql.js initialization. USB/web build uses same-origin /wasm/sql-wasm.wasm (offline).
 */

/** sql.js exec() returns an array of { columns, values } per statement. */
export type SqlJsExecRow = { columns: string[]; values: unknown[][] };

export type SqlJsDatabase = {
  run(sql: string, params?: Record<string, unknown> | unknown[]): void;
  exec(sql: string): SqlJsExecRow[];
  export(): Uint8Array;
  close(): void;
  prepare(sql: string): SqlJsStatement;
};

export type SqlJsStatement = {
  /** sql.js accepts positional arrays or named object binds. */
  bind(values?: unknown): boolean;
  step(): boolean;
  get(): unknown[];
  getAsObject(): Record<string, unknown>;
  free(): boolean;
};

export type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

let sqlJsPromise: Promise<SqlJsModule> | null = null;

export function getSqlJsModule(): Promise<SqlJsModule> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("sql.js is only available in the browser.")
    );
  }
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const initSqlJs = (await import("sql.js")).default;
      const useLocalWasm =
        process.env.NEXT_PUBLIC_DB_BACKEND === "sqlite-file";

      if (useLocalWasm) {
        const wasmName = "sql-wasm.wasm";
        const wasmUrl = new URL(`/wasm/${wasmName}`, window.location.href).href;
        const res = await fetch(wasmUrl, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(
            `Could not load ${wasmName} (${res.status}). Ensure web/wasm/${wasmName} exists (run npm run build:web-sqlite and npm run pack-portable).`
          );
        }
        const wasmBinary = await res.arrayBuffer();
        const SQL = await initSqlJs({ wasmBinary });
        return SQL as unknown as SqlJsModule;
      }

      const SQL = await initSqlJs({
        locateFile: (file: string) =>
          `https://sql.js.org/dist/${file}`,
      });
      return SQL as unknown as SqlJsModule;
    })();
  }
  return sqlJsPromise;
}

/** Reset module cache (e.g. after hot reload in dev). */
export function resetSqlJsModuleCache(): void {
  sqlJsPromise = null;
}
