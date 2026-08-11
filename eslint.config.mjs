import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import importPlugin from "eslint-plugin-import";

/**
 * Every feature that owns a slice of the app. Adding a folder under
 * `src/features` without adding it here means it silently escapes the
 * cross-feature boundary below, so keep the two in step.
 */
const FEATURES = ["auth", "keys", "shielded", "pay", "request", "portfolio"];

/**
 * Only these may reach into `features/keys`. Everything else goes through a
 * feature's public `index.ts` and never touches key material directly.
 *
 * `auth` derives the keys once a signature comes back, `shielded` needs the
 * secret in-process to build a proof. Nothing else has a reason, and a reason
 * that appears later is a design conversation, not a quick import.
 */
const KEY_CONSUMERS = ["auth", "shielded"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
    },
    rules: {
      /**
       * The architecture, enforced rather than documented. A convention people
       * have to remember is a convention that erodes; this one fails the build.
       *
       * `target` is the code being protected, `from` is what it may not import.
       */
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            // 1. Features cannot reach into each other's internals. Cross-feature
            //    traffic goes through the neighbour's `index.ts` and nothing
            //    else, so a feature's internals stay free to change.
            //
            //    The `except` list is what makes this a boundary rather than a
            //    wall: a feature's own folder, plus every other feature's public
            //    index.ts and nothing deeper. Without the second half this zone
            //    blocks cross-feature imports outright, `KEY_CONSUMERS` below
            //    becomes unreachable code, and `auth` cannot import the keys it
            //    exists to derive. It did exactly that until 2026-08-03, because
            //    the rule had only ever been tested with imports that were meant
            //    to fail. Paths in `except` are relative to `from`.
            //
            //    `auth/keys.ts` is the one exception to "index.ts and nothing
            //    deeper", and it is how the rule below survives contact with
            //    the app. The signed in shielded keys live in auth's context,
            //    and `shielded` has to reach them to build a proof. Exporting
            //    them from `auth/index.ts` would have handed the view key to
            //    every feature with a clean lint, because these zones restrict
            //    paths and every feature may import a neighbour's index. A
            //    second entry point puts that decision here, where it is one
            //    line and visible, instead of inside a barrel file.
            ...FEATURES.map((f) => ({
              target: `./src/features/${f}`,
              from: "./src/features",
              except: [
                `./${f}`,
                ...FEATURES.filter((other) => other !== f).map(
                  (other) => `./${other}/index.ts`,
                ),
                ...(f === "shielded" ? ["./auth/keys.ts"] : []),
              ],
              message:
                "Import the other feature's public index.ts, never a file inside it.",
            })),

            // 2. Secret material is confined to one folder. This is the rule the
            //    whole product rests on: if the shielded key can be imported
            //    from anywhere, sooner or later something persists it for
            //    convenience and a stolen laptop reads the owner's whole book.
            {
              target: [
                "./src/app",
                "./src/components",
                "./src/hooks",
                "./src/lib",
                "./src/types",
                ...FEATURES.filter((f) => !KEY_CONSUMERS.includes(f) && f !== "keys").map(
                  (f) => `./src/features/${f}`,
                ),
              ],
              from: "./src/features/keys",
              message:
                "Key material is confined to features/keys and is reachable only from auth and shielded. Go through a feature's public API.",
            },

            // 3. Dependencies point one way: shared -> features -> app. A
            //    feature that imports a route has been written backwards.
            {
              target: "./src/features",
              from: "./src/app",
              message: "Features must not import from routes. Invert the dependency.",
            },

            // 4. Shared code stays shared. The moment a UI primitive knows what
            //    a note is, it is not a primitive and belongs in the feature.
            {
              target: [
                "./src/components",
                "./src/hooks",
                "./src/lib",
                "./src/types",
                "./src/config",
              ],
              from: ["./src/features", "./src/app"],
              message:
                "Shared code cannot depend on features or routes. Move it into the feature that needs it.",
            },
          ],
        },
      ],
    },
  },

  {
    /**
     * Browser storage is where privacy goes to die. A shielded key written to
     * localStorage outlives the session, the tab, and the user's attention, and
     * it is exactly what an attacker with the device wants. Persist nothing;
     * derive on demand and let it die with the tab.
     *
     * Scoped to src so tooling and scripts are unaffected.
     */
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      /** A leading underscore is the agreed way to say "deliberately unused". */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      /**
       * All four of them, not two.
       *
       * This listed `localStorage` and `sessionStorage` only, while README and
       * AGENTS.md both said browser storage was blocked. The gap mattered more
       * than the two it covered: **IndexedDB is the API this rule exists for**,
       * because it is where Turnkey's own stamper keeps the session key and
       * where its SDK puts one by default. Anyone reaching for that SDK, or
       * writing a note cache in `features/shielded`, would have got a green
       * lint on the exact thing the app is built to refuse.
       */
      "no-restricted-globals": [
        "error",
        ...["localStorage", "sessionStorage", "indexedDB", "caches"].map((name) => ({
          name,
          message:
            "No persistent storage in this app. Derive secrets on demand and keep them in memory only.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["localStorage", "sessionStorage", "indexedDB", "caches"].map((property) => ({
          object: "window",
          property,
          message: "No persistent storage in this app.",
        })),
        {
          object: "document",
          property: "cookie",
          message:
            "No cookies in this app. A cookie is storage that also travels with every request.",
        },
      ],
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
