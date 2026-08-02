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
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
  type IndexKey,
} from "../indexes";

export type MemoryAdapter = {
  STORES: typeof STORES;
  tables: Map<string, Map<string, Record<string, unknown>>>;
  reads: { getAll: number; getByIndex: number; rowsScanned: number };
  resetCounters: () => void;
  getAll: (name: string) => Promise<Record<string, unknown>[]>;
  getByIndex: (
    name: string,
    indexName: string,
    lower: IndexKey,
    upper: IndexKey
  ) => Promise<Record<string, unknown>[]>;
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
  const reads = { getAll: 0, getByIndex: 0, rowsScanned: 0 };

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
    upper: IndexKey
  ) {
    const keyPath = getIndexKeyPath(name, indexName);
    if (!keyPath) throw new Error(`Unknown index ${name}.${indexName}`);
    reads.getByIndex += 1;
    const out: Record<string, unknown>[] = [];
    for (const row of tableFor(name).values()) {
      if (matchesIndexRange(row, keyPath, lower, upper)) out.push(row);
    }
    reads.rowsScanned += out.length;
    return sortByIndexOrder(out, keyPath);
  }

  return {
    STORES,
    tables,
    reads,
    resetCounters: () => {
      reads.getAll = 0;
      reads.getByIndex = 0;
      reads.rowsScanned = 0;
    },
    getAll: async (name: string) => {
      reads.getAll += 1;
      const rows = Array.from(tableFor(name).values());
      reads.rowsScanned += rows.length;
      return rows;
    },
    getByIndex,
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
