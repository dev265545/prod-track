/**
 * Generates app/generated/legacy-opacity-fallbacks.css for Chrome that does not
 * support color-mix() (Chrome < 111 — e.g. the last builds shipped on Windows 7).
 *
 * Tailwind v4 renders an opacity modifier such as `bg-muted/30` as
 * `color-mix(in oklab, var(--muted) 30%, transparent)`. A browser that cannot
 * parse color-mix() drops the declaration and falls back to the solid token, so
 * a 30%-tint surface renders as a 100% slab. This script emits the equivalent
 * rgba() rules, guarded by `@supports not (color-mix(...))`, so legacy Chrome
 * gets the intended translucency and modern Chrome ignores the whole block.
 *
 * NOTHING HERE IS HAND-MAINTAINED:
 *   • token colors are parsed out of app/globals.css (`:root` and `.dark`) — the
 *     single source of truth, so the two can never silently diverge;
 *   • the utility classes are discovered by scanning the JSX/TS sources, so a
 *     newly written `bg-success/15` is picked up without editing this file.
 *
 * Run: npm run generate:legacy-css   (the build does this automatically)
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const GLOBALS = join(ROOT, "app/globals.css");
const OUT = join(ROOT, "app/generated/legacy-opacity-fallbacks.css");
const SCAN_DIRS = ["app", "components", "lib"].map((d) => join(ROOT, d));
const SCAN_EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);

// ── 1. token colors, parsed from globals.css ────────────────────────────────

/**
 * Extracts the body of a top-level `<selector> { … }` rule.
 * @param {string} css
 * @param {string} selector
 */
function ruleBody(css, selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`generate-legacy-css: no "${selector}" rule in app/globals.css`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`generate-legacy-css: unbalanced braces in "${selector}"`);
}

/** @returns {{ rgb: number[], a: number } | null} */
function parseColor(value) {
  const v = value.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (m) {
    const raw = m[4];
    const a = raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
    return { rgb: [+m[1], +m[2], +m[3]], a };
  }
  return null; // var(), gradients, easings, lengths — not a literal color
}

/** @param {string} body */
function parseTokens(body) {
  /** @type {Map<string, {rgb: number[], a: number}>} */
  const out = new Map();
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const c = parseColor(value);
    if (c) out.set(name, c);
  }
  return out;
}

const css = readFileSync(GLOBALS, "utf8");
const LIGHT = parseTokens(ruleBody(css, ":root"));
const DARK = parseTokens(ruleBody(css, ".dark"));

// Literal colors Tailwind ships that are not theme tokens.
for (const map of [LIGHT, DARK]) {
  map.set("black", { rgb: [0, 0, 0], a: 1 });
  map.set("white", { rgb: [255, 255, 255], a: 1 });
}

/** Alpha modifiers compose: a token that is already translucent stays so. */
function rgba(color, modifier) {
  const a = +(color.a * modifier).toFixed(4);
  return `rgba(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]}, ${a})`;
}

// ── 2. utilities, discovered by scanning the sources ────────────────────────

/** Tailwind utility prefix → the CSS property its opacity modifier colors. */
const PROP = {
  bg: "background-color",
  text: "color",
  border: "border-color",
  ring: "--tw-ring-color",
  outline: "outline-color",
  decoration: "text-decoration-color",
  fill: "fill",
  stroke: "stroke",
  caret: "caret-color",
  accent: "accent-color",
  shadow: null, // --tw-shadow-color, composed differently — skipped
  from: null, // gradient stops are --tw-gradient-* — skipped
  via: null,
  to: null,
  divide: null,
  placeholder: null,
};

/** Variant prefix → the suffix it appends to the compiled selector. */
const VARIANT = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  disabled: ":disabled",
  "aria-invalid": '[aria-invalid="true"]',
  "aria-selected": '[aria-selected="true"]',
  "aria-expanded": '[aria-expanded="true"]',
};

const PREFIXES = Object.keys(PROP).join("|");
const VARIANT_ATOM = "(?:[a-z-]+|\\[[^\\]\\s]+\\]|data-\\[[^\\]\\s]+\\])";
const CLASS_RE = new RegExp(
  `(?<![\\w:/-])((?:${VARIANT_ATOM}:)*)(${PREFIXES})-([a-z]+(?:-[a-z0-9]+)*)\\/(\\d{1,3})(?![\\w./-])`,
  "g",
);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === "generated") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SCAN_EXT.has(extname(p))) yield p;
  }
}

const escapeClass = (s) => s.replace(/[.:/[\]()=,%#]/g, (c) => "\\" + c);

const warnings = new Set();
/** @type {Map<string, {selector: string, prop: string, token: string, modifier: number, darkOnly: boolean}>} */
const rules = new Map();

for (const file of SCAN_DIRS.flatMap((d) => [...walk(d)])) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(CLASS_RE)) {
    const [full, variantStr, prefix, token, pct] = m;
    const prop = PROP[prefix];
    if (prop === null) continue; // knowingly unsupported utility family
    if (!LIGHT.has(token) && !DARK.has(token)) {
      warnings.add(`unknown token "${token}" in "${full}" (${file.slice(ROOT.length + 1)})`);
      continue;
    }
    const variants = variantStr ? variantStr.slice(0, -1).split(":") : [];
    let suffix = "";
    let darkOnly = false;
    let bad = false;
    for (const v of variants) {
      if (v === "dark") darkOnly = true;
      else if (VARIANT[v]) suffix += VARIANT[v];
      else if (/^data-\[.+\]$/.test(v)) suffix += `[${v.slice(6, -1)}]`;
      // `[a]:` is an element-scoped variant; `[&_code]:` is a nesting variant
      // whose `&` we cannot express here, so it falls through to `bad`.
      else if (/^\[[^&]+\]$/.test(v)) suffix += `:is(${v.slice(1, -1)})`;
      else bad = true;
    }
    if (bad) {
      warnings.add(`unsupported variant in "${full}" (${file.slice(ROOT.length + 1)})`);
      continue;
    }
    const selector = (darkOnly ? ".dark " : "") + "." + escapeClass(full) + suffix;
    rules.set(selector + "|" + prop, {
      selector,
      prop,
      token,
      modifier: Math.min(100, +pct) / 100,
      darkOnly,
    });
  }
}

// ── 3. emit ────────────────────────────────────────────────────────────────

function emit(rule) {
  const { selector, prop, token, modifier, darkOnly } = rule;
  const light = LIGHT.get(token);
  const dark = DARK.get(token) ?? light;
  const out = [];
  if (!darkOnly && light) out.push(`  ${selector} {\n    ${prop}: ${rgba(light, modifier)} !important;\n  }\n`);
  if (dark) {
    const sel = darkOnly ? selector : `.dark ${selector}`;
    // Only worth a dark override when the value actually differs.
    if (darkOnly || !light || rgba(dark, modifier) !== rgba(light, modifier)) {
      out.push(`  ${sel} {\n    ${prop}: ${rgba(dark, modifier)} !important;\n  }\n`);
    }
  }
  return out.join("");
}

const sorted = [...rules.values()].sort((a, b) => a.selector.localeCompare(b.selector));
const body = sorted.map(emit).join("");

const header =
  "/* AUTO-GENERATED by scripts/generate-legacy-opacity-fallbacks.mjs — do not edit by hand */\n" +
  "/*\n * Tailwind v4 opacity modifiers compile to color-mix(); Chrome < 111 cannot parse it and\n" +
  " * falls back to the solid token. These rgba() rules mirror the intended mix. Token colors\n" +
  " * are parsed from app/globals.css and the class list is scanned from source, so this file\n" +
  " * is always in sync — regenerate with `npm run generate:legacy-css`.\n */\n";

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${header}@supports not (color: color-mix(in lab, red, red)) {\n${body}}\n`, "utf8");

for (const w of [...warnings].sort()) console.warn(`  warn: ${w}`);
console.log(`Wrote ${OUT} (${sorted.length} utilities from ${LIGHT.size} light / ${DARK.size} dark tokens)`);
