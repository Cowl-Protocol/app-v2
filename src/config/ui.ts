/**
 * Switches for things that get in the way while the UI is being built.
 *
 * These are plain constants rather than env vars on purpose. This app is a
 * static export, so an env var is baked in at build time and toggling one means
 * a rebuild. Editing a constant hot reloads instantly, which is what an
 * afternoon of layout work actually needs.
 *
 * Nothing here is a feature flag. A flag that decides whether real money moves
 * belongs beside the thing that moves it, not in a file of view preferences.
 *
 * The two below replace the `/login` and `/home` routes that used to exist for
 * reaching a screen directly. One route renders the whole flow now, so a second
 * way in would be a second copy of every screen, free to drift from the one
 * people actually see.
 */
import { AUTH_CONFIGURED } from "./auth";

/**
 * The eyes preloader on first paint.
 *
 * **On**, because it is the opening of the real flow rather than decoration.
 * Turn it off while working on a screen behind it: it runs on every reload and
 * holds the screen for about three seconds, which is three seconds per change to
 * a card you are looking at fifty times an hour.
 *
 * Off means the component is never rendered, so no overlay is in the markup at
 * all. It is not hidden with CSS, which would still ship the element and still
 * run the timeline.
 */
export const SHOW_PRELOADER = true;

/**
 * Start already signed in, skipping the login card.
 *
 * For working on the home screen without clicking through the door every
 * reload. **Leave it false.**
 *
 * This used to carry a warning that it was harmless only while there was no auth
 * to bypass, and that it would still be sitting here when there was. Auth landed
 * on 2026-08-08, so it is that constant now: a session it grants has no Turnkey
 * session, no wallet and no keys, and the screens behind it read placeholder
 * figures. Useful for layout, indistinguishable from a real session at a glance,
 * and one commit away from shipping.
 *
 * So it is no longer only a warning. `assertNoSkipInConfiguredBuild` below turns
 * it into a build failure the moment a build has the ids that let it sign
 * somebody in for real, which is the only case where leaving it on could reach a
 * user. Layout builds have no ids and are unaffected.
 */
export const SKIP_LOGIN = false;

/**
 * Refuse to build a real login and a bypassed one at the same time.
 *
 * Thrown at module load, which under `output: "export"` is during prerender, so
 * it fails `npm run build` rather than shipping a page that quietly lets anyone
 * past the door. A comment asking the next person to remember would be a
 * comment; this is the same rule the architecture zones follow.
 */
function assertNoSkipInConfiguredBuild(): void {
  if (SKIP_LOGIN && AUTH_CONFIGURED) {
    throw new Error(
      "SKIP_LOGIN is on in a build that has real sign in credentials. " +
        "Set it back to false, or drop the auth ids from this build's environment.",
    );
  }
}

assertNoSkipInConfiguredBuild();

/**
 * Render a state that is otherwise only reachable by doing something the app
 * cannot do yet.
 *
 * `"paid"` shows the Receive panel at the moment a payment lands: the arrival,
 * and the fresh address that replaces the one just used. `"arriving"` shows the
 * home screen while the session's automatic move of public funds is in flight:
 * something landed on a funnel address and is being added to the balance. Both
 * last a few seconds in real use and would otherwise be undesignable.
 *
 * The payer's screen used to be here too. It is a route now, `/pay`, so it is
 * reachable by typing an address and needs no switch.
 *
 * **Leave it null.** Same reasoning as `SKIP_LOGIN`: harmless while nothing is
 * wired, and exactly the shape of the constant that is still sitting here when
 * something is.
 */
export type Preview = null | "paid" | "arriving";

export const PREVIEW: Preview = null;
