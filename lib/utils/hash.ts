/**
 * ProdTrack Lite - lightweight, dependency-free content hashing.
 *
 * Not cryptographic; used only to detect "same file re-imported" so the
 * inventory importer can short-circuit no-op re-imports. FNV-1a over the
 * raw bytes: same bytes -> same hash, any byte change -> (almost
 * certainly) different hash.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a hash of raw bytes, returned as a hex string. */
export function fnv1aHash(bytes: Uint8Array): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    // 32-bit multiply by FNV_PRIME, done via shifts to stay in int32 range.
    hash =
      (hash +
        (hash << 1) +
        (hash << 4) +
        (hash << 7) +
        (hash << 8) +
        (hash << 24)) >>>
      0;
    void FNV_PRIME; // documents the constant this shift sequence implements
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Hash an ArrayBuffer's raw bytes. Folds the FNV-1a digest together with the
 * byte length (as a hex prefix) to further reduce accidental collisions
 * between different-length files that happen to hash the same 32 bits.
 */
export function hashArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const digest = fnv1aHash(bytes);
  return `${bytes.length.toString(16)}-${digest}`;
}
