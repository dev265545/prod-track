import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  setAppPassword,
  verifyAppPassword,
  setWorkerPassword,
  verifyWorkerPassword,
  verifyAgainstStored,
  storedAlgo,
  hasAppPassword,
  hasWorkerPassword,
  login,
  loginAs,
  startSession,
  logout,
  isLoggedIn,
  touchSession,
  getCurrentRole,
  isAdmin,
  IDLE_TIMEOUT_MS,
  MIN_PASSWORD_LENGTH,
} from "./auth";

// The vitest environment here is "node" (see vitest.config.ts), so there is
// no global localStorage the way there would be under jsdom. auth.ts guards
// every localStorage access with `typeof localStorage !== "undefined"`
// specifically so it degrades gracefully without one — but for these tests
// we actually want the localStorage-fallback code paths (DB is never open
// in unit tests either, per the try/catch fallback already in auth.ts) to
// persist state across calls within a test, so we install a tiny in-memory
// polyfill.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();

const PASSWORD = "adminpass1";
const WORKER_PASSWORD = "workerpass123";

/** Legacy unsalted SHA-256 hex, as written by pre-PBKDF2 versions. */
async function legacySha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("no default password (removed 1968 fallback)", () => {
  it("verifyAppPassword is false for the old default when nothing is stored", async () => {
    expect(await verifyAppPassword("1968")).toBe(false);
    expect(await verifyAppPassword("")).toBe(false);
    expect(await verifyAppPassword("anything")).toBe(false);
  });

  it("login() fails and starts no session when no password is configured", async () => {
    expect(await login("1968")).toBe(false);
    expect(isLoggedIn()).toBe(false);
  });

  it("hasAppPassword() reports false before setup and true after, so callers can route to onboarding", async () => {
    expect(await hasAppPassword()).toBe(false);
    await setAppPassword(PASSWORD);
    expect(await hasAppPassword()).toBe(true);
  });

  it("the old default stops working once a real password is set", async () => {
    await setAppPassword(PASSWORD);
    expect(await verifyAppPassword("1968")).toBe(false);
    expect(await verifyAppPassword(PASSWORD)).toBe(true);
  });
});

describe("no master password", () => {
  it("does not export a master password or verifier", async () => {
    const mod = (await import("./auth")) as Record<string, unknown>;
    expect(mod.MASTER_PASSWORD).toBeUndefined();
    expect(mod.verifyMasterPassword).toBeUndefined();
  });

  it("the removed master password is not accepted as an admin password", async () => {
    await setAppPassword(PASSWORD);
    expect(await verifyAppPassword("9319123410")).toBe(false);
  });
});

describe("PBKDF2 hashing", () => {
  it("stores a salted PBKDF2 record, not a bare SHA-256 hex digest", async () => {
    await setAppPassword(PASSWORD);
    const stored = localStorage.getItem("prodtrack_app_password_hash")!;
    const rec = JSON.parse(stored);
    expect(rec.algo).toBe("pbkdf2-sha256");
    expect(rec.iterations).toBe(200_000);
    expect(rec.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.hash).not.toBe(await legacySha256(PASSWORD));
  });

  it("uses a different salt (and therefore hash) for the same password each time", async () => {
    await setAppPassword(PASSWORD);
    const first = JSON.parse(localStorage.getItem("prodtrack_app_password_hash")!);
    await setAppPassword(PASSWORD);
    const second = JSON.parse(localStorage.getItem("prodtrack_app_password_hash")!);
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
  });

  it("verifies legacy sha256 credentials transparently", async () => {
    const legacy = await legacySha256(PASSWORD);
    expect(storedAlgo(legacy)).toBe("sha256-legacy");
    expect(await verifyAgainstStored(PASSWORD, legacy)).toBe(true);
    expect(await verifyAgainstStored("wrong", legacy)).toBe(false);
  });

  it("lets a legacy-hashed user log in and re-hashes them to PBKDF2", async () => {
    localStorage.setItem(
      "prodtrack_app_password_hash",
      await legacySha256(PASSWORD),
    );
    expect(await login(PASSWORD)).toBe(true);
    const stored = localStorage.getItem("prodtrack_app_password_hash")!;
    expect(storedAlgo(stored)).toBe("pbkdf2-sha256");
    // Still usable after the upgrade.
    expect(await verifyAppPassword(PASSWORD)).toBe(true);
  });
});

describe("minimum password length", () => {
  it("setAppPassword rejects passwords shorter than the minimum", async () => {
    await expect(setAppPassword("12345")).rejects.toThrow(
      /at least 6 characters/,
    );
    expect(MIN_PASSWORD_LENGTH).toBe(6);
    // Nothing was persisted.
    expect(localStorage.getItem("prodtrack_app_password_hash")).toBeNull();
  });

  it("setAppPassword accepts a password at exactly the minimum length", async () => {
    await setAppPassword("123456");
    expect(await verifyAppPassword("123456")).toBe(true);
  });

  it("setWorkerPassword enforces the same minimum", async () => {
    await expect(setWorkerPassword("abc")).rejects.toThrow(
      /at least 6 characters/,
    );
  });
});

describe("worker password", () => {
  it("round-trips: set then verify succeeds with correct password, fails with wrong one", async () => {
    await setWorkerPassword(WORKER_PASSWORD);
    expect(await verifyWorkerPassword(WORKER_PASSWORD)).toBe(true);
    expect(await verifyWorkerPassword("wrongpass")).toBe(false);
  });

  it("returns false when no worker password has ever been set (no default fallback)", async () => {
    expect(await verifyWorkerPassword("anything")).toBe(false);
    expect(await verifyWorkerPassword("1968")).toBe(false);
  });

  it("hasWorkerPassword() reports false before setup and true after", async () => {
    expect(await hasWorkerPassword()).toBe(false);
    await setWorkerPassword(WORKER_PASSWORD);
    expect(await hasWorkerPassword()).toBe(true);
  });

  it("changing it signs out a worker who is currently logged in", async () => {
    await setWorkerPassword(WORKER_PASSWORD);
    await loginAs(WORKER_PASSWORD);
    expect(getCurrentRole()).toBe("worker");

    await setWorkerPassword("anotherworkerpass");
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
    expect(await verifyWorkerPassword("anotherworkerpass")).toBe(true);
  });

  it("keeps the admin who performs the change signed in", async () => {
    await setAppPassword(PASSWORD);
    await loginAs(PASSWORD);
    expect(isAdmin()).toBe(true);

    await setWorkerPassword(WORKER_PASSWORD);
    expect(isLoggedIn()).toBe(true);
    expect(getCurrentRole()).toBe("admin");
  });
});

describe("loginAs", () => {
  it("returns 'admin' and sets role for the correct admin password", async () => {
    await setAppPassword(PASSWORD);
    const role = await loginAs(PASSWORD);
    expect(role).toBe("admin");
    expect(getCurrentRole()).toBe("admin");
    expect(isLoggedIn()).toBe(true);
  });

  it("returns 'worker' and sets role for the correct worker password", async () => {
    await setWorkerPassword(WORKER_PASSWORD);
    const role = await loginAs(WORKER_PASSWORD);
    expect(role).toBe("worker");
    expect(getCurrentRole()).toBe("worker");
    expect(isLoggedIn()).toBe(true);
  });

  it("resolves to 'worker' when both passwords are the same value (lower privilege wins)", async () => {
    const shared = "sharedpass1";
    await setAppPassword(shared);
    await setWorkerPassword(shared);
    const role = await loginAs(shared);
    expect(role).toBe("worker");
    expect(getCurrentRole()).toBe("worker");
    expect(isAdmin()).toBe(false);
  });

  it("returns null and starts no session for a wrong password", async () => {
    await setAppPassword(PASSWORD);
    const role = await loginAs("totally-wrong");
    expect(role).toBeNull();
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
  });
});

describe("login() no longer stamps credentials into the DB", () => {
  it("does not write a password hash when logging in against a legacy DB-less install", async () => {
    // No stored credential at all: login must fail rather than persist one.
    expect(await login("someBrandNewPassword")).toBe(false);
    expect(localStorage.getItem("prodtrack_app_password_hash")).toBeNull();
  });

  it("does not overwrite the stored credential on a normal successful login", async () => {
    await setAppPassword(PASSWORD);
    const before = localStorage.getItem("prodtrack_app_password_hash");
    expect(await login(PASSWORD)).toBe(true);
    expect(localStorage.getItem("prodtrack_app_password_hash")).toBe(before);
  });
});

describe("session invalidation on password change", () => {
  it("setAppPassword kills the current session", async () => {
    await setAppPassword(PASSWORD);
    await login(PASSWORD);
    expect(isLoggedIn()).toBe(true);

    await setAppPassword("brandNewPass1");
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
  });

  it("a session holding a stale nonce is dead even with a fresh timestamp", async () => {
    await setAppPassword(PASSWORD);
    await login(PASSWORD);
    // Simulate another window rotating the password (nonce moves on).
    localStorage.setItem("prodtrack_app_session_nonce", "some-other-nonce");
    expect(isLoggedIn()).toBe(false);
  });

  it("logging in again after a password change works", async () => {
    await setAppPassword(PASSWORD);
    await login(PASSWORD);
    await setAppPassword("brandNewPass1");
    expect(await login("brandNewPass1")).toBe(true);
    expect(isLoggedIn()).toBe(true);
  });
});

describe("idle timeout", () => {
  it("expires a session after 30 minutes of inactivity", async () => {
    vi.useFakeTimers();
    await setAppPassword(PASSWORD);
    await login(PASSWORD);
    expect(isLoggedIn()).toBe(true);

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1000);
    expect(isLoggedIn()).toBe(false);
  });

  it("touchSession() refreshes the idle window", async () => {
    vi.useFakeTimers();
    await setAppPassword(PASSWORD);
    await login(PASSWORD);

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000);
    touchSession();
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000);
    expect(isLoggedIn()).toBe(true);
  });

  it("keeps the 5-hour absolute cap even with constant activity", async () => {
    vi.useFakeTimers();
    await setAppPassword(PASSWORD);
    await login(PASSWORD);

    for (let i = 0; i < 12 * 5 + 1; i++) {
      vi.advanceTimersByTime(5 * 60_000);
      touchSession();
    }
    expect(isLoggedIn()).toBe(false);
  });

  it("touchSession() never resurrects an expired session", async () => {
    vi.useFakeTimers();
    await setAppPassword(PASSWORD);
    await login(PASSWORD);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1000);
    touchSession();
    expect(isLoggedIn()).toBe(false);
  });
});

describe("getCurrentRole", () => {
  it("returns null when not logged in even with a stale role in localStorage", () => {
    localStorage.setItem("prodtrack_session_role", "admin");
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
  });
});

describe("logout", () => {
  it("clears timestamp, role and nonce so getCurrentRole() is null afterward", async () => {
    await setAppPassword(PASSWORD);
    await loginAs(PASSWORD);
    expect(getCurrentRole()).toBe("admin");
    logout();
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
    expect(localStorage.getItem("prodtrack_session_nonce")).toBeNull();
  });
});

describe("isAdmin", () => {
  it("is true only when role is admin", async () => {
    await setAppPassword(PASSWORD);
    await loginAs(PASSWORD);
    expect(isAdmin()).toBe(true);

    logout();
    await setWorkerPassword(WORKER_PASSWORD);
    await loginAs(WORKER_PASSWORD);
    expect(isAdmin()).toBe(false);
  });

  it("is false when not logged in", () => {
    expect(isAdmin()).toBe(false);
  });
});

describe("regression: login() and startSession() behavior", () => {
  it("login() works with the configured admin password", async () => {
    await setAppPassword(PASSWORD);
    expect(await login(PASSWORD)).toBe(true);
    expect(isLoggedIn()).toBe(true);
  });

  it("login() fails for a wrong password and starts no session", async () => {
    await setAppPassword(PASSWORD);
    expect(await login("nope")).toBe(false);
    expect(isLoggedIn()).toBe(false);
  });

  it("login() tags the session as admin role internally", async () => {
    await setAppPassword(PASSWORD);
    await login(PASSWORD);
    expect(getCurrentRole()).toBe("admin");
  });

  it("setAppPassword + verifyAppPassword round-trip", async () => {
    await setAppPassword("newAdminPass");
    expect(await verifyAppPassword("newAdminPass")).toBe(true);
    expect(await verifyAppPassword("1968")).toBe(false);
  });

  it("startSession(role) persists a role alongside the timestamp", () => {
    startSession("worker");
    expect(isLoggedIn()).toBe(true);
    expect(getCurrentRole()).toBe("worker");
  });
});
