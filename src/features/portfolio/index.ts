/**
 * Public surface of the portfolio feature.
 *
 * Other features import this file and nothing deeper. Everything not exported
 * here is free to move, rename, or disappear without touching another feature.
 *
 * One export, and that is the shape this feature was aiming for. `PROFILE` used
 * to sit beside it, a placeholder name for the top bar, and it went when the bar
 * started reading the session: who is signed in is `auth`'s to answer, and a
 * portfolio that exported a person was a portfolio holding somebody else's fact.
 */
export { HomeScreen } from "./components/home-screen";
