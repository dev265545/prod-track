import { describe, it, expect, beforeEach } from "vitest";
import {
  setAppPassword,
  verifyAppPassword,
  setWorkerPassword,
  verifyWorkerPassword,
  login,
  loginAs,
  startSession,
  logout,
  isLoggedIn,
  getCurrentRole,
  isAdmin,
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

beforeEach(() => {
  localStorage.clear();
});

describe("worker password", () => {
  it("round-trips: set then verify succeeds with correct password, fails with wrong one", async () => {
    await setWorkerPassword("workerpass123");
    expect(await verifyWorkerPassword("workerpass123")).toBe(true);
    expect(await verifyWorkerPassword("wrongpass")).toBe(false);
  });

  it("returns false when no worker password has ever been set (no default fallback)", async () => {
    expect(await verifyWorkerPassword("anything")).toBe(false);
    expect(await verifyWorkerPassword("1968")).toBe(false);
  });
});

describe("loginAs", () => {
  it("returns 'admin' and sets role for the correct admin password", async () => {
    const role = await loginAs("1968"); // default app password
    expect(role).toBe("admin");
    expect(getCurrentRole()).toBe("admin");
    expect(isLoggedIn()).toBe(true);
  });

  it("returns 'worker' and sets role for the correct worker password", async () => {
    await setWorkerPassword("workerpass123");
    const role = await loginAs("workerpass123");
    expect(role).toBe("worker");
    expect(getCurrentRole()).toBe("worker");
    expect(isLoggedIn()).toBe(true);
  });

  it("returns null and starts no session for a wrong password", async () => {
    expect(isLoggedIn()).toBe(false);
    const role = await loginAs("totally-wrong");
    expect(role).toBeNull();
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
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
  it("clears both timestamp and role so getCurrentRole() is null afterward", async () => {
    await loginAs("1968");
    expect(getCurrentRole()).toBe("admin");
    logout();
    expect(isLoggedIn()).toBe(false);
    expect(getCurrentRole()).toBeNull();
  });
});

describe("isAdmin", () => {
  it("is true only when role is admin", async () => {
    await loginAs("1968");
    expect(isAdmin()).toBe(true);

    logout();
    await setWorkerPassword("workerpass123");
    await loginAs("workerpass123");
    expect(isAdmin()).toBe(false);
  });

  it("is false when not logged in", () => {
    expect(isAdmin()).toBe(false);
  });
});

describe("regression: existing login() and startSession() behavior", () => {
  it("login() still works exactly as before with the default admin password", async () => {
    const ok = await login("1968");
    expect(ok).toBe(true);
    expect(isLoggedIn()).toBe(true);
  });

  it("login() fails for a wrong password and starts no session", async () => {
    const ok = await login("nope");
    expect(ok).toBe(false);
    expect(isLoggedIn()).toBe(false);
  });

  it("login() tags the session as admin role internally", async () => {
    await login("1968");
    expect(getCurrentRole()).toBe("admin");
  });

  it("setAppPassword + verifyAppPassword still round-trip as before", async () => {
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
