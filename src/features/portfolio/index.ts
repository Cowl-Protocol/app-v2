/**
 * Public surface of the portfolio feature.
 *
 * Other features import this file and nothing deeper. Everything not exported
 * here is free to move, rename, or disappear without touching another feature.
 *
 * `PROFILE` is exported beside the screen only because the placeholder phase
 * needs something to put in the top bar. It goes when auth is wired and the
 * session becomes the thing that knows who is signed in.
 */
export { HomeScreen } from "./components/home-screen";
export { PROFILE } from "./lib/placeholder";
