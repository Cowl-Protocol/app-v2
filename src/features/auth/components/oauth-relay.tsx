"use client";

import { useEffect, useState } from "react";
import { readCallbackFragment } from "../lib/google";

/**
 * What the popup lands on when Google is done with it.
 *
 * It has one job: hand the identity token to the tab that opened it and get out
 * of the way. The app itself is not here, and deliberately so. A popup that
 * booted the whole client would run the preloader, mount the login screen, and
 * generate a second session keypair with no relationship to the nonce Google
 * just signed, all for a window that lives for about a frame.
 *
 * **Nothing here reads or writes the token beyond passing it along.** It is a
 * bearer credential for the account until it is spent, and the tab that opened
 * this one is the only tab holding the private key that can spend it.
 *
 * The token arrives in the url fragment, which is where the implicit flow puts
 * it and which is a genuine privacy property rather than an accident: fragments
 * are never sent to a server, so it does not appear in an access log, a proxy,
 * or a referrer. `location.replace` in the opener's flow and the immediate
 * `close()` here keep it from lingering in history either.
 *
 * If `postMessage` never lands, the fallback below is a person reading a
 * sentence and closing a window, rather than a spinner that never resolves in a
 * tab they are no longer looking at.
 */
export function OAuthRelay() {
  const [orphaned, setOrphaned] = useState(false);

  useEffect(() => {
    // Missing when this url is opened directly, or when the browser severed the
    // opener. There is nowhere to send the token then, and the token is useless
    // without the key in the window that is gone, so it is simply dropped.
    const opener = window.opener as Window | null;

    if (opener) {
      // Same origin only. The opener is our own app, and naming it rather than
      // using "*" keeps the token out of any other document that might have
      // navigated into this window's opener slot.
      opener.postMessage(readCallbackFragment(window.location.hash), window.location.origin);
      window.close();
    }

    // One timer covers both ways this window outlives its purpose: there was no
    // opener to message, or `close()` was refused, which it may be, because a
    // window that a script did not open cannot always close itself. Either way
    // somebody is looking at a page that has finished, so tell them.
    const stuck = window.setTimeout(() => setOrphaned(true), 1200);
    return () => window.clearTimeout(stuck);
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="max-w-[34ch] text-center text-[13px] leading-relaxed text-bone/45">
        {orphaned
          ? "You can close this window and return to Cowl."
          : "Signing you in, one moment."}
      </p>
    </main>
  );
}
