/**
 * Everything sign in needs to reach the wallet provider.
 *
 * These are **public identifiers, not secrets**. A Privy app id and client id
 * are both meant to be read by anyone who opens the page, and neither authorises
 * anything on its own: Privy checks the request origin against an allowlist held
 * in its dashboard, and the app secret that can actually act on an account never
 * comes near this app · it lives on a laptop and is read only by
 * `npm run probe:privy`.
 *
 * They are env vars rather than constants because they are the one kind of
 * setting `config/ui.ts` deliberately excludes: values that differ between a
 * laptop and production. `output: "export"` bakes them in at build time, so a
 * change means a rebuild, which is correct for something that identifies a
 * deployment.
 *
 * **Nothing here has a fallback.** An unconfigured build reports that it is
 * unconfigured, loudly, at the button. A default would produce a login screen
 * that looks fine and fails at the provider's door with an error page nobody can
 * read.
 */

/** Dashboard · App settings · App ID. Identifies which Privy app a session belongs to. */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/**
 * Dashboard · App settings · Clients · Client ID.
 *
 * Separate from the app id because one app can serve several clients, and the
 * origin allowlist is held per client. Optional in the SDK, and set here anyway:
 * a build that names its client is a build whose origin can be pinned to it.
 */
export const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";

/**
 * Where the provider returns the browser after Google.
 *
 * Left unset the SDK returns to the page that started the flow, which is right
 * for a laptop and for any deployment served from the host being visited. It is
 * overridable because a static export can be served from more than one host, and
 * an origin allowlist compares strings rather than intent.
 *
 * Empty means "the SDK decides", which is why this is `undefined` rather than
 * `""` when unset: passing an empty string would name the site root as a
 * redirect target and lose whatever page the user started from.
 */
export const OAUTH_REDIRECT_URL = process.env.NEXT_PUBLIC_PRIVY_REDIRECT_URL || undefined;

/**
 * Whether this build can actually sign anybody in.
 *
 * Checked at the button rather than at boot. A build with no ids is still worth
 * running, because every screen behind the door is reachable with `SKIP_LOGIN`
 * and the layout work that fills them does not need an account.
 */
export const AUTH_CONFIGURED = PRIVY_APP_ID !== "";
