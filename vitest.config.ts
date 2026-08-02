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
