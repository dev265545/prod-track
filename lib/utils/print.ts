/**
 * Print HTML content. Works in both web (opens new window) and Tauri
 * (injects into current window, since window.open is blocked).
 */

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { __TAURI__?: unknown }).__TAURI__;
}

export function printHtml(html: string): void {
  if (isTauri()) {
    printInCurrentWindow(html);
  } else {
    printInNewWindow(html);
  }
}

function printInNewWindow(html: string): void {
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 300);
  }
}

function printInCurrentWindow(html: string): void {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const styleEl = doc.querySelector("style");
  const styleHtml = styleEl ? styleEl.outerHTML : "";
  const bodyContent = doc.body.innerHTML;

  const container = document.createElement("div");
  container.id = "prodtrack-print-container";
  container.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:#fff;overflow:auto;padding:16px;";

  container.innerHTML = styleHtml + bodyContent;

  const hideRest = document.createElement("style");
  hideRest.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #prodtrack-print-container,
      #prodtrack-print-container * { visibility: visible !important; }
      #prodtrack-print-container {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        padding: 16px !important;
        background: #fff !important;
      }
    }
  `;

  document.head.appendChild(hideRest);
  document.body.appendChild(container);

  const cleanup = () => {
    container.remove();
    hideRest.remove();
  };

  window.onafterprint = cleanup;
  window.onfocus = () => {
    setTimeout(cleanup, 100);
    window.onafterprint = null;
    window.onfocus = null;
  };

  setTimeout(() => window.print(), 100);
}
