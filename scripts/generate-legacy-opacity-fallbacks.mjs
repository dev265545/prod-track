/**
 * Generates app/generated/legacy-opacity-fallbacks.css for Chrome that does not support
 * color-mix(). Tailwind v4 opacity utilities fall back to solid var(--token) without it.
 *
 * When you change sRGB fallbacks in app/globals.css :root / .dark, update LEGACY_THEME_RGB.
 * When you add Tailwind opacity classes in JSX (e.g. bg-foo/15), add a matching rule here
 * and run: npm run generate:legacy-css
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../app/generated/legacy-opacity-fallbacks.css");

/** Must match the hex fallbacks in app/globals.css (:root and .dark sRGB blocks). */
const LEGACY_THEME_RGB = {
  primary: { light: [22, 27, 29], dark: [227, 231, 232] },
  muted: { light: [241, 243, 243], dark: [34, 41, 43] },
  chart1: { light: [255, 161, 173], dark: [255, 161, 173] },
  destructive: { light: [231, 0, 11], dark: [255, 100, 103] },
  foreground: { light: [9, 11, 12], dark: [249, 251, 251] },
  border: { light: [227, 231, 232], dark: [227, 231, 232] },
  mutedForeground: { light: [103, 120, 124], dark: [156, 168, 171] },
  ring: { light: [156, 168, 171], dark: [103, 120, 124] },
};

function rgba(rgb, a) {
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * @typedef {{ class?: string, selector?: string, prop: string, token: keyof typeof LEGACY_THEME_RGB, alpha: number, mode?: "both" | "chartOnly", darkOverride?: string }} TokenRule
 * @typedef {{ selector: string, prop: string, value: string }} RawRule
 */

/** @type {(TokenRule | RawRule)[]} */
const RULES = [
  { class: "bg-primary\\/10", prop: "background-color", token: "primary", alpha: 0.1 },
  { class: "border-primary\\/30", prop: "border-color", token: "primary", alpha: 0.3 },
  { class: "border-primary\\/70", prop: "border-color", token: "primary", alpha: 0.7 },
  { class: "bg-muted\\/30", prop: "background-color", token: "muted", alpha: 0.3 },
  { class: "bg-muted\\/40", prop: "background-color", token: "muted", alpha: 0.4 },
  { class: "bg-muted\\/50", prop: "background-color", token: "muted", alpha: 0.5 },
  { class: "bg-chart-1\\/20", prop: "background-color", token: "chart1", alpha: 0.2, mode: "chartOnly" },
  { class: "bg-chart-1\\/50", prop: "background-color", token: "chart1", alpha: 0.5, mode: "chartOnly" },
  { class: "border-chart-1\\/50", prop: "border-color", token: "chart1", alpha: 0.5, mode: "chartOnly" },
  { class: "text-destructive\\/70", prop: "color", token: "destructive", alpha: 0.7 },
  { class: "bg-destructive\\/10", prop: "background-color", token: "destructive", alpha: 0.1 },
  { class: "bg-destructive\\/20", prop: "background-color", token: "destructive", alpha: 0.2 },
  { class: "bg-foreground\\/20", prop: "background-color", token: "foreground", alpha: 0.2 },
  {
    class: "border-border\\/80",
    prop: "border-color",
    token: "border",
    alpha: 0.8,
    darkOverride: "rgba(255, 255, 255, 0.08)",
  },
  { class: "border-muted-foreground\\/35", prop: "border-color", token: "mutedForeground", alpha: 0.35 },
  {
    class: "decoration-muted-foreground\\/40",
    prop: "text-decoration-color",
    token: "mutedForeground",
    alpha: 0.4,
  },
  { selector: ".hover\\:bg-destructive\\/10:hover", prop: "background-color", token: "destructive", alpha: 0.1 },
  { selector: ".hover\\:bg-destructive\\/20:hover", prop: "background-color", token: "destructive", alpha: 0.2 },
  { selector: ".hover\\:ring-primary\\/20:hover", prop: "--tw-ring-color", token: "primary", alpha: 0.2 },
  {
    selector: ".focus-within\\:ring-primary\\/20:focus-within",
    prop: "--tw-ring-color",
    token: "primary",
    alpha: 0.2,
  },
  { selector: ".focus\\:ring-destructive\\/30:focus", prop: "--tw-ring-color", token: "destructive", alpha: 0.3 },
  {
    selector: ".focus-visible\\:border-destructive\\/40:focus-visible",
    prop: "border-color",
    token: "destructive",
    alpha: 0.4,
  },
  {
    selector: ".focus-visible\\:ring-destructive\\/20:focus-visible",
    prop: "--tw-ring-color",
    token: "destructive",
    alpha: 0.2,
  },
  {
    selector: ".aria-invalid\\:ring-destructive\\/20[aria-invalid=\"true\"]",
    prop: "--tw-ring-color",
    token: "destructive",
    alpha: 0.2,
  },
  {
    selector: ".focus-visible\\:ring-ring\\/50:focus-visible",
    prop: "--tw-ring-color",
    token: "ring",
    alpha: 0.5,
  },
  { selector: ".ring-foreground\\/10", prop: "--tw-ring-color", token: "foreground", alpha: 0.1 },
  {
    selector: ".\\[a\\]\\:hover\\:bg-primary\\/80:is(a):hover",
    prop: "background-color",
    token: "primary",
    alpha: 0.8,
  },
  { selector: ".bg-black\\/80", prop: "background-color", value: "rgba(0, 0, 0, 0.8)" },
];

const DARK_ONLY = [
  { selector: ".dark .dark\\:bg-destructive\\/20", prop: "background-color", token: "destructive", alpha: 0.2 },
  { selector: ".dark .dark\\:bg-destructive\\/30", prop: "background-color", token: "destructive", alpha: 0.3 },
  {
    selector: ".dark .dark\\:hover\\:bg-destructive\\/30:hover",
    prop: "background-color",
    token: "destructive",
    alpha: 0.3,
  },
  {
    selector: ".dark .dark\\:focus-visible\\:ring-destructive\\/40:focus-visible",
    prop: "--tw-ring-color",
    token: "destructive",
    alpha: 0.4,
  },
  {
    selector: ".dark .dark\\:aria-invalid\\:border-destructive\\/50[aria-invalid=\"true\"]",
    prop: "border-color",
    token: "destructive",
    alpha: 0.5,
  },
  {
    selector: ".dark .dark\\:aria-invalid\\:ring-destructive\\/40[aria-invalid=\"true\"]",
    prop: "--tw-ring-color",
    token: "destructive",
    alpha: 0.4,
  },
  { selector: ".dark .dark\\:bg-input\\/30", prop: "background-color", value: "rgba(255, 255, 255, 0.08)" },
  {
    selector: ".dark .dark\\:hover\\:bg-input\\/50:hover",
    prop: "background-color",
    value: "rgba(255, 255, 255, 0.12)",
  },
];

/**
 * @param {TokenRule | RawRule} rule
 */
function emitRule(rule) {
  if ("value" in rule && rule.value !== undefined) {
    return `  ${rule.selector} {\n    ${rule.prop}: ${rule.value} !important;\n  }\n`;
  }

  const token = LEGACY_THEME_RGB[rule.token];
  const sel = rule.selector ?? `.${rule.class}`;
  const prop = rule.prop;
  const alpha = rule.alpha;
  const mode = rule.mode ?? "both";

  if (rule.darkOverride) {
    return (
      `  ${sel} {\n    ${prop}: ${rgba(token.light, alpha)} !important;\n  }\n` +
      `  .dark ${sel} {\n    ${prop}: ${rule.darkOverride} !important;\n  }\n`
    );
  }

  if (mode === "chartOnly") {
    const c = token.light;
    return `  ${sel} {\n    ${prop}: ${rgba(c, alpha)} !important;\n  }\n`;
  }

  return (
    `  ${sel} {\n    ${prop}: ${rgba(token.light, alpha)} !important;\n  }\n` +
    `  .dark ${sel} {\n    ${prop}: ${rgba(token.dark, alpha)} !important;\n  }\n`
  );
}

function main() {
  const chunks = [
    "/* AUTO-GENERATED by scripts/generate-legacy-opacity-fallbacks.mjs — do not edit by hand */\n",
    "/*\n * Tailwind v4 opacity modifiers use color-mix when supported; otherwise they fall back to\n * solid var(--token) on legacy Chrome. These rgba rules mirror the intended mix.\n */\n",
    "@supports not (color: color-mix(in lab, red, red)) {\n",
  ];

  for (const r of RULES) {
    chunks.push(emitRule(r));
  }

  for (const r of DARK_ONLY) {
    if ("value" in r && r.value !== undefined) {
      chunks.push(`  ${r.selector} {\n    ${r.prop}: ${r.value} !important;\n  }\n`);
    } else {
      const t = LEGACY_THEME_RGB[r.token];
      chunks.push(`  ${r.selector} {\n    ${r.prop}: ${rgba(t.dark, r.alpha)} !important;\n  }\n`);
    }
  }

  chunks.push("}\n");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, chunks.join(""), "utf8");
  console.log(`Wrote ${OUT}`);
}

main();
