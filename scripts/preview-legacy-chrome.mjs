/**
 * Build a Chrome-109 preview of the exported site, viewable in a MODERN browser.
 *
 * You cannot make today's Chrome forget how to parse `oklch()` or `color-mix()`,
 * and spoofing the user agent changes nothing about CSS support. But the app is
 * built sRGB-first: every modern colour sits inside an `@supports` block with a
 * plain sRGB declaration outside it. Chrome 109 simply never enters those blocks.
 *
 * So: copy `out/`, delete exactly the blocks Chrome 109 would skip, and open the
 * copy in any browser. What renders is what a Windows 7 machine renders.
 *
 * Caveat this does NOT cover: JavaScript. Missing JS APIs are polyfilled by
 * core-js in the bundle, but this script does not verify that, and it cannot
 * reproduce a parse error from syntax Chrome 109 does not understand. It is a
 * faithful preview of LAYOUT AND COLOUR only.
 *
 *   node scripts/preview-legacy-chrome.mjs
 *   node portable/serve.mjs out-legacy      # then open the printed URL
 */
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "out");
const DEST = join(root, "out-legacy");

/** Conditions Chrome 109 evaluates to false. Matches how globals.css guards. */
const UNSUPPORTED = [/color-mix\s*\(/i, /oklab\s*\(/i, /oklch\s*\(/i, /color\s*\(\s*display-p3/i];

/**
 * Remove every `@supports (...)` block whose condition Chrome 109 cannot meet,
 * tracking brace depth so nested rules inside the block go with it.
 */
function stripUnsupportedBlocks(css) {
  let out = "";
  let i = 0;
  let removed = 0;

  while (i < css.length) {
    const at = css.indexOf("@supports", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    const open = css.indexOf("{", at);
    if (open === -1) {
      out += css.slice(i);
      break;
    }
    const condition = css.slice(at + "@supports".length, open);

    // Walk to the matching close brace.
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
      j += 1;
    }

    // `@supports not (...)` is the LEGACY branch — Chrome 109 takes it, so keep it.
    const isNegated = /\bnot\b/.test(condition);
    const usesModern = UNSUPPORTED.some((re) => re.test(condition));

    out += css.slice(i, at);
    if (usesModern && !isNegated) {
      removed += 1; // Chrome 109 skips this block entirely.
    } else {
      out += css.slice(at, j);
    }
    i = j;
  }

  return { css: out, removed };
}

async function* cssFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* cssFiles(full);
    else if (entry.name.endsWith(".css")) yield full;
  }
}

const main = async () => {
  await rm(DEST, { recursive: true, force: true });
  await cp(SRC, DEST, { recursive: true });

  let files = 0;
  let blocks = 0;
  let leftover = 0;
  const unguarded = new Set();

  for await (const file of cssFiles(DEST)) {
    const original = await readFile(file, "utf8");
    const { css, removed } = stripUnsupportedBlocks(original);
    if (removed > 0) await writeFile(file, css);
    files += 1;
    blocks += removed;

    // Anything modern still present is a colour Chrome 109 would fail to parse
    // and fall back to inherited/initial for — i.e. a real bug, not a preview
    // artifact. Report it loudly rather than silently rendering something wrong.
    //
    // Ignore the `@supports (...)` CONDITIONS themselves: a condition naming
    // color-mix is how a stylesheet asks whether color-mix works, and the
    // surviving `@supports not (...)` blocks are precisely the legacy branch
    // Chrome 109 takes. Counting those reported failures that do not exist.
    const declarationsOnly = css.replace(/@supports[^{]*\{/gi, "{");
    for (const re of UNSUPPORTED) {
      const hits = declarationsOnly.match(new RegExp(re.source, "gi"));
      if (hits) {
        leftover += hits.length;
        for (const line of declarationsOnly.split(/[;{}]/)) {
          if (re.test(line)) unguarded.add(line.trim().slice(0, 120));
        }
      }
    }
  }

  console.log(`Scanned ${files} stylesheet(s); removed ${blocks} modern @supports block(s).`);
  if (leftover > 0) {
    console.log(
      `WARNING: ${leftover} modern colour value(s) remain OUTSIDE any @supports guard.\n` +
        `Chrome 109 cannot parse these, so they render as an invalid colour.\n` +
        `Note Tailwind's own default palette vars are normally guarded; anything\n` +
        `reported here is worth opening.`,
    );
    for (const line of unguarded) console.log(`  ${line}`);
  } else {
    console.log("No unguarded modern colour values remain. Chrome 109 gets the designed sRGB path.");
  }
  console.log(`\nPreview written to out-legacy/\n  node portable/serve.mjs out-legacy`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
