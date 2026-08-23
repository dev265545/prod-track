import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, ".") };

/**
 * Two suites, two environments, one command.
 *
 * The logic suite (`lib/**` `*.test.ts`, ~900 tests) stays in the `node`
 * environment exactly as it was: building a jsdom document costs real
 * milliseconds per file, and 66 files that never touch the DOM should not pay
 * it. Rendered-markup tests are `.test.tsx` and get jsdom.
 *
 * `projects` rather than the deprecated `environmentMatchGlobs` or a per-file
 * `@vitest-environment` docblock, because only projects give the DOM suite its
 * own `setupFiles` (jest-dom matchers, RTL cleanup, the browser APIs jsdom
 * omits) without loading any of that into the node suite.
 *
 *   npx vitest run                  both
 *   npx vitest run --project node   the fast logic suite only
 *   npx vitest run --project dom    the rendered-component suite only
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          /**
           * The *.bench.test.ts files seed realistic datasets — one builds
           * 146,000 audit rows, another 43,800 attendance rows — to prove a
           * read is bounded rather than scanning. That work is genuinely
           * slower than a unit test, and at the default 5s they flake on any
           * machine that is also compiling or running other work, which says
           * nothing about the code. The assertions are on row counts, not
           * wall-clock, so a longer ceiling costs nothing.
           */
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          exclude: ["**/node_modules/**", ".next/**", "apps/**"],
          setupFiles: ["./vitest.setup.dom.ts"],
        },
      },
    ],
  },
  resolve: { alias },
});
