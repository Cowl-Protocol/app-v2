/**
 * Public surface of the auth feature.
 *
 * Other features import this file and nothing deeper. Everything not exported
 * here is free to move, rename, or disappear without touching another feature.
 *
 * The gate, the relay and the top bar are what a route renders. The bar is here
 * rather than in `components/layout` because the only dynamic thing on it is the
 * account, which is this feature's; the layout primitive it wraps still knows
 * nothing about sessions. The login card and
 * the screen around it stay private: nothing outside this feature should be able
 * to put a sign in form on screen without going through the thing that decides
 * whether one is needed.
 *
 * **The shielded keys are not here, and that is the boundary.** They leave this
 * feature through `features/auth/keys.ts`, a second entry point that only
 * `features/shielded` may import, enforced in eslint.config.mjs. Exporting them
 * from this file would have handed the view key to every feature in the app with
 * a clean lint, because the zones restrict paths and every feature is allowed to
 * import a neighbour's index. `useAccount` here returns only what a screen may
 * know, which today is the label in the corner.
 *
 * `useSignOut` rather than a bare function, because ending a session means
 * dropping the Turnkey key **and** the shielded keys, and only the gate holds
 * the second one.
 */
export { AuthGate } from "./components/auth-gate";
export { SessionBar } from "./components/session-bar";
export { OAuthRelay } from "./components/oauth-relay";
export { useAccount, useSignOut } from "./lib/account-context";
