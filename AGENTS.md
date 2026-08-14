<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# app-v2 house rules

Read `README.md` first. It is short and it is the contract for this project.

The three that are easiest to break without noticing:

- **No server.** `output: "export"` is a privacy guarantee, not a deployment
  preference. Never add an API route, middleware, or a server action. Server side
  secrets belong in a separate service.
- **No persistence of secrets.** No `localStorage`, `sessionStorage`, IndexedDB
  or cookies for anything derived from a key. Derive on demand, hold in memory,
  let it die with the tab. ESLint blocks the storage globals under `src/`.
  The wallet provider's own auth token is the one exception and it is not ours to
  move · see README, "Two decisions that shape everything else".
- **The wallet provider has one door.** Only `features/auth/lib/providers/` and
  `features/auth/components/auth-provider.tsx` may import its SDK. Everything
  else uses the ports in `features/auth/lib/signer.ts`. ESLint blocks the rest.
  Swapping provider should cost those files and never `unlock.ts`.

Structure is enforced by `import/no-restricted-paths` and `no-restricted-imports`
in `eslint.config.mjs`.
Run `npm run lint` before claiming anything works. Adding a feature means adding
its name to the `FEATURES` array there, or it silently escapes the boundary.

Rendered copy carries no em or en dashes. Use the house middot `·`.
