import { OAuthRelay } from "@/features/auth";

/**
 * `/auth/callback` · where Google returns the popup, and nothing else.
 *
 * **Not a screen anybody navigates to.** It exists because Google compares the
 * redirect uri to a registered string and needs somewhere real to send the
 * browser, and because that somewhere should not be the app. Landing the popup
 * on `/` would boot the whole client inside a window that lives for one frame,
 * and it would put an identity token in the front door's url.
 *
 * **The token is in the fragment**, which is the implicit flow's doing and is
 * also the reason this is safe to serve from a static host: fragments are never
 * sent in an HTTP request, so the token reaches this page without passing
 * through the web server, a proxy, or anybody's access log.
 *
 * **Deploy note, and it is the same one `/pay` carries.** This builds to
 * `out/auth/callback.html`, not `out/auth/callback/index.html`. Local `serve`
 * and Vercel resolve the path to it; a plain web root does not, so Caddy needs
 * `try_files {path} {path}.html`, or `trailingSlash: true` fixes it everywhere
 * and moves this to `/auth/callback/`. That is now two routes waiting on one
 * unmade decision, and this one has a second cost: whichever address wins has to
 * be registered with Google, byte for byte, before anybody can sign in.
 *
 * **One header would break this and no header here can prevent it.** The relay
 * talks to the tab that opened it through `window.opener`, which
 * `Cross-Origin-Opener-Policy: same-origin` severs. A static export sets no
 * headers, so the default is correct; the risk is a hardening pass on the web
 * server adding one and taking sign in with it.
 */
export default function AuthCallbackPage() {
  return <OAuthRelay />;
}
