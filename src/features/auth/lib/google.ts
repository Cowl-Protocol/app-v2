/**
 * The Google half of sign in: get an identity token bound to this session key.
 *
 * **This is a popup, and that is forced rather than chosen.** The nonce Google
 * signs into the token is `sha256` of the session public key, and Turnkey
 * re-checks it inside its enclave, so the private half has to survive from
 * before the redirect until after it. A full page redirect ends the page, and
 * this app persists nothing, so the key would be gone and the token it came back
 * with would be unspendable. Storing the key across the hop is the one thing
 * `session-key.ts` exists to refuse.
 *
 * Implicit flow, `response_type=id_token`, which returns the token straight to
 * the browser in the fragment. There is no code to exchange and therefore no
 * client secret, which is what makes this possible without a server at all.
 * Fragments are not sent to any host, so the token never appears in a request
 * line or a web server's log.
 */
import { GOOGLE_CLIENT_ID, googleRedirectUri } from "@/config/auth";
import { SignInError } from "./errors";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** How long the popup may stay open before we stop waiting for it. */
const TIMEOUT_MS = 5 * 60 * 1000;

/** What the callback route posts back to the app. Same shape both ways. */
export type OAuthMessage = {
  source: "cowl-oauth";
  state: string;
  idToken?: string;
  error?: string;
};

/**
 * Open the window, empty, and hand it back.
 *
 * **Separate from the rest of sign in, and it has to stay that way.** A browser
 * only allows `window.open` while it still considers itself inside a user
 * gesture, and an `await` before it spends that. Chrome is lenient enough to
 * hide the mistake, keeping the activation alive for a few seconds; Safari is
 * not, and blocks the popup outright. So this is synchronous, it does no work,
 * and `signIn` calls it as its very first statement before generating a key.
 *
 * The window opens on `about:blank` and is pointed at Google once the nonce has
 * been computed, which is the standard way to have both a popup and an address
 * that depends on async work.
 */
export function openSignInWindow(): Window {
  // **`_blank`, never a fixed name.** A named window is addressable by any other
  // document in the same browsing context group, so two tabs of this app
  // starting sign in at once would have the second one retarget the first one's
  // popup: it navigates to Google carrying the second tab's nonce, and the token
  // comes back to the first tab's opener bound to a key that tab does not hold.
  // The `state` check below would catch it and both flows would fail, which is
  // not a failure anyone could diagnose. `_blank` makes it unaddressable.
  const popup = window.open("about:blank", "_blank", popupFeatures());
  if (!popup) {
    throw new SignInError(
      "Your browser blocked the sign in window. Allow popups for this site and try again.",
      "window.open returned null",
    );
  }
  return popup;
}

/**
 * Point the window at Google, wait for it to come back, return the token.
 *
 * Closing the window on failure is the caller's job. It owns the handle from
 * before this was called, and a popup left sitting on Google's domain after an
 * error is a window the user has to find and close themselves.
 */
export async function completeGoogleSignIn(
  popup: Window,
  sessionPublicKey: string,
): Promise<string> {
  const state = randomState();
  popup.location.replace(await authUrl(sessionPublicKey, state));
  return await awaitToken(popup, state);
}

/**
 * The authorization url.
 *
 * `nonce` is the load bearing parameter. Google signs it into the token, Turnkey
 * verifies it equals `sha256` of the public key presented at login, and that is
 * the whole reason a stolen token cannot be replayed by anyone else: they would
 * need the private key, which never left this tab.
 *
 * `prompt=select_account` because a browser signed into several Google accounts
 * would otherwise pick one silently, and picking the wrong one here does not
 * produce a warning, it produces a different wallet with a different balance.
 */
async function authUrl(sessionPublicKey: string, state: string): Promise<string> {
  const redirectUri = googleRedirectUri();

  // **The callback has to be on this origin**, because the way it returns the
  // token is `postMessage` to its opener, pinned to its own origin. Point the
  // redirect at another host and every sign in succeeds at Google, the message
  // is dropped by the browser, the popup closes, and the opener reports that
  // sign in was cancelled. Forever, with nothing to read. Since
  // `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` exists precisely so a build can name a
  // host it is not being served from, this is a real configuration and it is
  // better refused out loud than debugged from a wrong symptom.
  if (new URL(redirectUri, window.location.origin).origin !== window.location.origin) {
    throw new SignInError(
      "Sign in is misconfigured for this address, so it cannot continue.",
      `redirect uri ${redirectUri} is not on ${window.location.origin}`,
    );
  }

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("nonce", await sha256Hex(sessionPublicKey));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Wait for the callback route to post the token back.
 *
 * Three ways out, and all three end with a listener removed and an interval
 * cleared: the message arrives, the user closes the window, or the clock runs
 * out. A promise that can only settle one way is how a sign in button ends up
 * spinning forever on a page the user has already given up on.
 */
function awaitToken(popup: Window, state: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let done = false;

    const settle = (fn: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearInterval(closedTimer);
      clearTimeout(timeout);
      clearTimeout(grace);
      fn();
    };

    function onMessage(event: MessageEvent) {
      // Anyone can post to this window. Origin first, then that it came from
      // the window we opened, then shape, then the state we generated, so a
      // message that is merely well formed is not enough to end the flow. The
      // origin check is what confines senders to documents we serve, and it is
      // the only thing between an XSS on this origin and a token handed to a
      // flow, so the cheap extra conditions are worth having behind it.
      if (event.origin !== window.location.origin) return;
      if (event.source !== popup) return;
      const data = event.data as OAuthMessage | undefined;
      if (data?.source !== "cowl-oauth" || data.state !== state) return;

      settle(() => {
        popup.close();
        if (data.idToken) resolve(data.idToken);
        else reject(new SignInError(googleMessage(data.error), `google returned ${data.error}`));
      });
    }

    window.addEventListener("message", onMessage);

    /**
     * `closed` is the only signal a dismissed popup gives. There is no event.
     *
     * **The grace period is the subtle part.** The relay posts the token and
     * then closes itself, so `closed` can flip while the message is still a
     * queued task, and which queue the event loop serves next is up to the
     * browser. Rejecting the instant the window disappears would occasionally
     * report a cancelled sign in for one that had just succeeded, and the token
     * would be dropped by the listener this had already removed. So a closed
     * window starts a short wait rather than ending the flow, and a message
     * arriving inside it still wins.
     */
    let grace: number | undefined;
    const closedTimer = window.setInterval(() => {
      if (!popup.closed || grace !== undefined) return;
      grace = window.setTimeout(
        () => settle(() => reject(new SignInError("Sign in was cancelled.", "popup closed"))),
        400,
      );
    }, 300);

    const timeout = window.setTimeout(
      () =>
        settle(() => {
          popup.close();
          reject(new SignInError("Sign in timed out.", `no reply within ${TIMEOUT_MS}ms`));
        }),
      TIMEOUT_MS,
    );
  });
}

/**
 * Read the token out of a callback url fragment.
 *
 * Lives here rather than in the callback component so that what is written into
 * the fragment and what is read out of it stay in one file. Returns the raw
 * message the opener expects, error included, because the callback route's job
 * is to relay whatever happened rather than to judge it.
 */
export function readCallbackFragment(hash: string): OAuthMessage {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const state = params.get("state") ?? "";
  const idToken = params.get("id_token");
  if (idToken) return { source: "cowl-oauth", state, idToken };
  return { source: "cowl-oauth", state, error: params.get("error") ?? "unknown" };
}

/**
 * Google's error codes, in words, for the two a user can actually cause.
 * Anything else keeps its code, which is more use in a bug report than a
 * paraphrase would be.
 */
function googleMessage(code: string | undefined): string {
  if (code === "access_denied") return "Sign in was cancelled.";
  if (code === "immediate_failed") return "Google could not sign you in without asking. Try again.";
  return `Google sign in failed${code && code !== "unknown" ? `: ${code}` : "."}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Roughly Google's own consent screen, centred on the window it opened from. */
function popupFeatures(): string {
  const width = 500;
  const height = 620;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  return `width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`;
}
