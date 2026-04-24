/**
 * Tauri API bridge using window.__TAURI__.
 * Avoids @tauri-apps/* imports so Next.js static build succeeds.
 * Only used when running inside Tauri (isTauri() is true).
 */

declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
      opener?: { openPath: (path: string, openWith?: string) => Promise<void> };
      printer?: { getPrinters: () => Promise<string>; printHtml: (opts: { id: string; html: string; printer: string }) => Promise<void> };
    };
  }
}

function getInvoke() {
  if (typeof window === "undefined") return null;
  return (window as Window).__TAURI__?.core?.invoke;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = getInvoke();
  if (!fn) throw new Error("Tauri is not available");
  return fn(cmd, args);
}

export async function openPath(path: string, openWith?: string): Promise<void> {
  const opener = typeof window !== "undefined" ? (window as Window).__TAURI__?.opener : undefined;
  if (opener?.openPath) return opener.openPath(path, openWith);
  await invoke("plugin:opener|open_path", { path, openWith });
}

export async function getPrinters(): Promise<string> {
  const printer = typeof window !== "undefined" ? (window as Window).__TAURI__?.printer : undefined;
  if (printer?.getPrinters) return printer.getPrinters();
  return invoke<string>("plugin:printer|get_printers");
}

export async function printHtml(opts: { id: string; html: string; printer: string }): Promise<void> {
  const printer = typeof window !== "undefined" ? (window as Window).__TAURI__?.printer : undefined;
  if (printer?.printHtml) return printer.printHtml(opts);
  return invoke("plugin:printer|print_html", opts);
}
