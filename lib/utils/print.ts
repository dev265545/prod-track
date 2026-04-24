/**
 * Print HTML content.
 * - Tauri with printer: native printer plugin (OS print dialog).
 * - Tauri without printer: opens HTML in system browser for preview + print (e.g. Save as PDF).
 * - Web: new window + window.print() with short delay.
 */

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { __TAURI__?: unknown }).__TAURI__;
}

/** Injects a script that triggers the print dialog when the page loads (e.g. in browser). */
function injectPrintScript(html: string): string {
  const script =
    '<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>';
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }
  return html + script;
}

function printInNewWindow(html: string): void {
  console.log("[print] Opening new window for print...");
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 200);
    console.log("[print] New window opened, print dialog will show.");
  } else {
    console.warn("[print] window.open returned null – popup may be blocked.");
  }
}

/** Opens HTML in system default browser for preview and print (Save as PDF). Used in Tauri when no printer. */
async function openHtmlInBrowser(html: string): Promise<void> {
  console.log("[print] Opening HTML in system browser (no printer / fallback)...");
  try {
    const { invoke, openPath } = await import("@/lib/tauriBridge");
    const htmlWithPrint = injectPrintScript(html);
    console.log("[print] Writing temp file...");
    const path = await invoke<string>("write_temp_html", { html: htmlWithPrint });
    console.log("[print] Temp file path:", path);
    await openPath(path);
    console.log("[print] openPath done – browser should have opened.");
  } catch (e) {
    console.error("[print] openHtmlInBrowser failed:", e);
    throw e;
  }
}

export async function printHtml(html: string): Promise<void> {
  console.log("[print] printHtml called, html length:", html?.length ?? 0);
  const tauri = isTauri();
  console.log("[print] Environment:", tauri ? "Tauri" : "Web");

  if (tauri) {
    try {
      console.log("[print] Tauri: fetching printers...");
      const { getPrinters, printHtml: pluginPrintHtml } = await import(
        "@/lib/tauriBridge"
      );
      const printersJson = await getPrinters();
      const printers = JSON.parse(printersJson) as {
        name: string;
        is_default?: boolean;
      }[];
      console.log("[print] Printers found:", printers?.length ?? 0, printers);
      const printer =
        printers.find((p) => p.is_default)?.name ?? printers[0]?.name ?? "";
      if (printer) {
        console.log("[print] Using printer:", printer);
        await pluginPrintHtml({
          id: "prodtrack-print",
          html,
          printer,
        });
        console.log("[print] Plugin print done.");
        return;
      }
      console.log("[print] No printer selected, falling back to browser.");
    } catch (e) {
      console.warn("[print] Printer plugin error (no printer?):", e);
    }
    await openHtmlInBrowser(html);
  } else {
    printInNewWindow(html);
  }
}
