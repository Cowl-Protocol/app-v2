/**
 * Which provider holds the keys.
 *
 * **One line, and that is the point.** Everything in this feature imports
 * `useWalletSession` from here, so changing provider is changing which module
 * this file re-exports. The last swap touched `unlock.ts`, `funnel.ts` and
 * `sign-in.ts` because each of them named the vendor directly; a lint rule now
 * refuses that outright, and this is where the one permitted decision lives.
 */
export { usePrivyWalletSession as useWalletSession } from "./privy";
