/**
 * Everything sign in needs to reach Turnkey and Google.
 *
 * These are **public identifiers, not secrets**. An auth proxy config id and an
 * OAuth client id are both meant to be read by anyone who opens the page, and
 * neither authorises anything on its own: the proxy checks the request origin
 * against an allowlist held in Turnkey's dashboard, and Google checks the
 * redirect uri against one held in Google's. A stolen client id gets an attacker
 * a login screen that can only ever redirect back to us.
 *
 * They are env vars rather than constants because they are the one kind of
 * setting `config/ui.ts` deliberately excludes: values that differ between a
 * laptop and production. `output: "export"` bakes them in at build time, so a
 * change means a rebuild, which is correct for something that identifies a
 * deployment.
 *
 * **Nothing here has a fallback.** An unconfigured build reports that it is
 * unconfigured, loudly, at the button. A default would produce a login screen
 * that looks fine and fails at Google's door with an error page nobody can read.
 */

/** Turnkey's public API. Requests are authorised by the stamp, never by a key in this app. */
export const TURNKEY_API_BASE_URL = "https://api.turnkey.com";

/**
 * Turnkey's managed auth proxy.
 *
 * It exists so that sub-organization creation and OAuth login, both of which
 * need the parent organization's API key, can happen without us running a server
 * to hold one. That matters more here than convenience: a service of ours in
 * this path would see every user's Google identity token, which carries their
 * email, and the whole point of `output: "export"` is that no box of ours is in
 * a position to learn that. The proxy moves the secret to the party that already
 * holds the account.
 */
export const TURNKEY_AUTH_PROXY_URL = "https://authproxy.turnkey.com";

/** Dashboard · Embedded Wallets · Configuration. Sent as `X-Auth-Proxy-Config-ID`. */
export const TURNKEY_AUTH_PROXY_CONFIG_ID =
  process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? "";

/** Google Cloud · Credentials · OAuth 2.0 Client ID, of type Web application. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/**
 * Where Google sends the popup back to. Must match a registered redirect uri
 * **exactly**, including the scheme and any trailing slash.
 *
 * Left unset it is this origin's `/auth/callback`, which is right for a laptop
 * and for any deployment whose host is the one being visited. It is overridable
 * because a static export can be served from more than one host and Google
 * compares strings, not intent.
 */
export function googleRedirectUri(): string {
  const configured = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/callback`;
}

/**
 * Whether this build can actually sign anybody in.
 *
 * Checked at the button rather than at boot. A build with no ids is still worth
 * running, because every screen behind the door is reachable with `SKIP_LOGIN`
 * and the layout work that fills them does not need an account.
 */
export const AUTH_CONFIGURED =
  TURNKEY_AUTH_PROXY_CONFIG_ID !== "" && GOOGLE_CLIENT_ID !== "";
