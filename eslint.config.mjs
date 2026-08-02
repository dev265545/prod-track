import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config replacement for the legacy .eslintrc.json ("extends":
 * ["next/core-web-vitals"]). Next.js 16 removed `next lint`, and eslint 9
 * requires flat config, so the lint script now runs `eslint .` directly.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      // Chrome 109 preview build (scripts/preview-legacy-chrome.mjs) — a copy of
      // out/ with modern @supports blocks stripped. Linting it drowned the real
      // findings in ~4800 problems from minified vendor bundles.
      "out-legacy/**",
      "dist/**",
      "node_modules/**",
      "app/generated/**",
      "js/**",
      "package/**",
      "portable/**",
      "src-tauri/target/**",
      "apps/portal/**",
      "build.js",
      "build.css",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Node build/release scripts are CommonJS by design.
    files: ["scripts/**/*.js", ".github/scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
