/**
 * In-memory stand-in for `lib/db/adapter`, for tests.
 *
 * Test-only: nothing under `app/` imports it, so it never reaches the bundle.
 *
 * It deliberately implements `getByIndex` by reusing the *production*
 * `matchesIndexRange` / `sortByIndexOrder`, so a test can never pass against a
 * hand-written approximation of the range semantics that the real backends do
 * not share.
 */

import { STORES } from "../schema";
import {
  applyIndexReadOptions,
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
  type IndexKey,
  type IndexReadOptions,
} from "../indexes";

export type MemoryAdapter = {
  STORES: typeof STORES;
  tables: Map<string, Map<string, Record<string, unknown>>>;
  reads: {
    getAll: number;
    getByIndex: number;
    countByIndex: number;
    rowsScanned: number;
  };
  resetCounters: () => void;
  getAll: (name: string) => Promise<Record<string, unknown>[]>;
  getByIndex: (
    name: string,
    indexName: string,
    lower: IndexKey,
    upper: IndexKey,
    options?: IndexReadOptions
  ) => Promise<Record<string, unknown>[]>;
  countByIndex: (
    name: string,
    indexName: string,
    lower: IndexKey,
    upper: IndexKey
  ) => Promise<number>;
  get: (name: string, id: string) => Promise<Record<string, unknown> | null>;
  put: (
    name: string,
    row: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  remove: (name: string, id: string) => Promise<void>;
  clear: (name: string) => Promise<void>;
  deleteWhere: (
    name: string,
    predicate: (row: Record<string, unknown>) => boolean
  ) => Promise<number>;
};

export function createMemoryAdapter(): MemoryAdapter {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const reads = { getAll: 0, getByIndex: 0, countByIndex: 0, rowsScanned: 0 };

  function tableFor(name: string) {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  }

  /**
   * Sorted-key lookup, standing in for IndexedDB's B-tree. Counting only the
   * rows it actually returns is what makes the benchmark's "rows scanned"
   * figure mean the same thing as work IndexedDB would really do: a range scan
   * deserialises the matches, `getAll` deserialises the store.
   */
  async function getByIndex(
    name: string,
    indexName: string,
    lower: IndexKey,
    upper: IndexKey,
    options?: IndexReadOptions
  ) {
    const keyPath = getIndexKeyPath(name, indexName);
    if (!keyPath) throw new Error(`Unknown index ${name}.${indexName}`);
    reads.getByIndex += 1;
    const matched: Record<string, unknown>[] = [];
    for (const row of tableFor(name).values()) {
      if (matchesIndexRange(row, keyPath, lower, upper)) matched.push(row);
    }
    const window = applyIndexReadOptions(
      sortByIndexOrder(matched, keyPath),
      options
    );
    // Charged for what the query returns, not what it looked at: a cursor with
    // a limit stops at the page boundary, so a bounded read must show as
    // cheap here or the benchmark would understate the fix.
    reads.rowsScanned += window.length;
    return window;
  }

  /** Counts keys, never rows — so it adds nothing to `rowsScanned`. */
  async function countByIndex(
    name: string,
    indexName: string,
    lower: IndexKey,
    upper: IndexKey
  ) {
    const keyPath = getIndexKeyPath(name, indexName);
    if (!keyPath) throw new Error(`Unknown index ${name}.${indexName}`);
    reads.countByIndex += 1;
    let n = 0;
    for (const row of tableFor(name).values()) {
      if (matchesIndexRange(row, keyPath, lower, upper)) n += 1;
    }
    return n;
  }

  return {
    STORES,
    tables,
    reads,
    resetCounters: () => {
      reads.getAll = 0;
      reads.getByIndex = 0;
      reads.countByIndex = 0;
      reads.rowsScanned = 0;
    },
    getAll: async (name: string) => {
      reads.getAll += 1;
      const rows = Array.from(tableFor(name).values());
      reads.rowsScanned += rows.length;
      return rows;
    },
    getByIndex,
    countByIndex,
    get: async (name: string, id: string) => {
      reads.rowsScanned += 1;
      return tableFor(name).get(id) ?? null;
    },
    put: async (name: string, row: Record<string, unknown>) => {
      tableFor(name).set(row.id as string, { ...row });
      return row;
    },
    remove: async (name: string, id: string) => {
      tableFor(name).delete(id);
    },
    clear: async (name: string) => {
      tableFor(name).clear();
    },
    deleteWhere: async (
      name: string,
      predicate: (row: Record<string, unknown>) => boolean
    ) => {
      const table = tableFor(name);
      let n = 0;
      for (const [id, row] of Array.from(table.entries())) {
        if (predicate(row)) {
          table.delete(id);
          n += 1;
        }
      }
      return n;
    },
  };
}
