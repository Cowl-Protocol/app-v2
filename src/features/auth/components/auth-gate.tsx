"use client";

import { useState } from "react";
import { Preloader } from "@/components/layout/preloader";
import { AUTH_CONFIGURED, SHOW_PRELOADER, SKIP_LOGIN } from "@/config";
import { AccountContext, SignOutContext } from "../lib/account-context";
import { AuthProvider } from "./auth-provider";
import { useSignIn } from "../lib/sign-in";
import { LoginScreen } from "./login-screen";

/**
 * What the one route shows: the entrance, then the door, then the app.
 *
 * **The stage is no longer this component's to own, and that is the provider
 * change showing through.** It used to hold `login` or `home` in state and move
 * between them when an awaited `signIn()` returned. Privy signs in by navigating
 * away, so the browser comes back on a fresh page with a session already
 * restored and nothing to await · which screen belongs on the glass is a
 * question about that restored state, and `useSignIn` is what answers it.
 *
 * What this component still owns is the preloader, because that is the one piece
 * of sequencing that is genuinely local: it is an entrance animation, it has no
 * opinion about who is signed in, and it must not replay on every state change
 * behind it.
 *
 * **The signed in app arrives as `children` rather than being imported here.**
 * The route composes it and passes it in, so `auth` never reaches for
 * `portfolio`. A gate that imported the app it guards would make the sign in
 * screen depend on the balance screen, which is backwards and gets worse with
 * every screen added behind it. React only creates those elements at the route,
 * it does not mount them, so nothing behind the door runs before the door opens.
 * The account itself travels by context instead.
 *
 * **A reload no longer returns to the beginning, and that is worth stating
 * plainly.** With the previous provider nothing survived the tab, so a refresh
 * was always a full sign in. Privy restores its own session from `localStorage`,
 * so a refresh lands on `unlocking` and derives the shielded keys again without
 * asking Google. The keys are still memory only and still die with the tab; what
 * survives is the ability to derive them again on this device.
 */

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [entered, setEntered] = useState(!SHOW_PRELOADER);

  if (!entered) {
    return (
      <>
        {/*
          The preloader paints over everything, so without this a visitor with no
          JavaScript gets the overlay removed by its own `<noscript>` and then a
          blank frame, since every screen past here is drawn by React. This app
          cannot work without JavaScript, it derives keys and builds proofs in the
          browser, so the honest thing is to say so rather than to serve nothing.
        */}
        <noscript>
          <p className="m-auto max-w-[36ch] p-8 text-center text-[13px] text-bone/60">
            This app runs entirely in your browser, so it needs JavaScript
            enabled.
          </p>
        </noscript>
        <Preloader onDone={() => setEntered(true)} />
      </>
    );
  }

  /*
    **An unconfigured build never mounts the provider, and never mounts the
    component that reads it.** The SDK throws on an empty app id, so the provider
    has to be skipped · and skipping it while still rendering `Gate` puts every
    provider hook outside its context. That surfaced as
    `useWallets was called outside the PrivyProvider component` during a static
    export, which is a warning today and undefined behaviour on the next release.

    This path is not an edge case. It is the one `SKIP_LOGIN` uses, and it is how
    every screen behind the door gets worked on without an account.
  */
  if (!AUTH_CONFIGURED) return <Unconfigured>{children}</Unconfigured>;

  /*
    The provider wraps the gate rather than the other way round, because `Gate`
    reads the session through hooks that need this context above them. Keeping
    all of it inside one exported component is what leaves the route file
    unchanged: a route picks the route and hands off, and which vendor holds the
    keys is not something it should have to name.
  */
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}

/**
 * A build with no credentials, which is a development shape rather than a
 * failure.
 *
 * Under `SKIP_LOGIN` the app behind the door renders with a null account, which
 * every consumer already handles · that is what makes layout work possible
 * without signing in. Otherwise the door is shown with its button inert, and
 * `LoginCard` says why in words, because a button that fails at the provider's
 * door with an unreadable page is worse than one that admits it cannot work.
 */
function Unconfigured({ children }: { children: React.ReactNode }) {
  if (SKIP_LOGIN) {
    return (
      <div key="home" className="rise flex flex-1 flex-col">
        {children}
      </div>
    );
  }
  return (
    <div key="login" className="rise flex flex-1 flex-col">
      <LoginScreen onGoogle={() => {}} pending={false} error={null} />
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const signIn = useSignIn();

  const account = signIn.stage === "ready" ? signIn.account : null;

  if (!account && !SKIP_LOGIN) {
    /*
      `loading` and `unlocking` both render the door with its button busy rather
      than a screen of their own. They are the two halves of a return from
      Google: the SDK restoring a session, then two signatures deriving the
      shielded account. Neither is something a person can act on, and a distinct
      screen for each would flash past on a fast connection and read as a bug on
      a slow one.
    */
    const busy =
      signIn.pending || signIn.stage === "loading" || signIn.stage === "unlocking";

    return (
      <div key="login" className="rise flex flex-1 flex-col">
        <LoginScreen
          onGoogle={signIn.begin}
          pending={busy}
          error={signIn.stage === "failed" ? signIn.message : null}
        />
      </div>
    );
  }

  return (
    <SignOutContext.Provider value={signIn.signOut}>
      <AccountContext.Provider value={account}>
        <div key="home" className="rise flex flex-1 flex-col">
          {children}
        </div>
      </AccountContext.Provider>
    </SignOutContext.Provider>
  );
}
