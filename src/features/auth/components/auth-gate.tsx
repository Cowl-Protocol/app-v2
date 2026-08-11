"use client";

import { useCallback, useState } from "react";
import { Preloader } from "@/components/layout/preloader";
import { SHOW_PRELOADER, SKIP_LOGIN } from "@/config";
import { AccountContext, SignOutContext } from "../lib/account-context";
import { isSignInError, reportSignInFailure } from "../lib/errors";
import { forgetSession, signIn, type Account } from "../lib/sign-in";
import { LoginScreen } from "./login-screen";

/**
 * What the one route shows: the entrance, then the door, then the app.
 *
 * **The door is real now.** Pressing Continue with Google opens Google, creates
 * or finds a Turnkey sub-organization, takes a session bound to a key that never
 * leaves this tab, and derives the shielded account from a signature by the
 * wallet inside it. `lib/sign-in.ts` is that sequence in one function and is the
 * file to read; this component only decides which of three screens is on.
 *
 * **The signed in app arrives as `children` rather than being imported here.**
 * The route composes it and passes it in, so `auth` never reaches for
 * `portfolio`. A gate that imported the app it guards would make the sign in
 * screen depend on the balance screen, which is backwards and gets worse with
 * every screen added behind it. React only creates those elements at the route,
 * it does not mount them, so nothing behind the door runs before the door opens.
 * The account itself travels by context instead, which is what lets that stay
 * true once the screens behind actually need a balance.
 *
 * Reloading returns to the beginning, and that is the design rather than a gap.
 * The shielded keys are memory only, the Turnkey session key is memory only, so
 * a reload has nothing to restore and no amount of state kept here could change
 * that. The cost is one sign in per tab, which README states as not negotiable.
 */

type Stage = "preload" | "login" | "home";

/**
 * Computed from constants and never from `window`, so the server and the first
 * client render agree. Reading a media query or a stored value here is the usual
 * way a gate like this starts flickering between two screens on load.
 */
const FIRST: Stage = SHOW_PRELOADER ? "preload" : SKIP_LOGIN ? "home" : "login";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>(FIRST);
  const [account, setAccount] = useState<Account | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = useCallback(async () => {
    // A second popup while the first is open would leave two flows racing for
    // one session key, and the loser's token is unspendable.
    if (pending) return;

    setPending(true);
    setError(null);
    try {
      const next = await signIn();
      setAccount(next);
      setStage("home");
    } catch (err) {
      reportSignInFailure(err);
      setError(readable(err));
    } finally {
      setPending(false);
    }
  }, [pending]);

  /**
   * Signing out, which is two acts that have to happen together.
   *
   * `forgetSession` makes the Turnkey session unusable. Clearing `account` is
   * what drops the shielded keys, and that is the half that cannot be undone if
   * it is skipped: the view key reads history backwards and cannot be rotated,
   * so leaving it live in a tab that says it is signed out is the worst version
   * of this bug rather than a cosmetic one.
   *
   * The stage goes back to `login` and not to `preload`, because the preloader
   * is an entrance and this is not an arrival.
   */
  const onSignOut = useCallback(() => {
    forgetSession();
    setAccount(null);
    setError(null);
    setStage("login");
  }, []);

  if (stage === "preload") {
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
        <Preloader onDone={() => setStage(SKIP_LOGIN ? "home" : "login")} />
      </>
    );
  }

  if (stage === "login") {
    // Keyed so the entrance animation runs on arrival rather than on mount of a
    // component that was already there.
    return (
      <div key="login" className="rise flex flex-1 flex-col">
        <LoginScreen onGoogle={onGoogle} pending={pending} error={error} />
      </div>
    );
  }

  return (
    <SignOutContext.Provider value={onSignOut}>
      <AccountContext.Provider value={account}>
        <div key="home" className="rise flex flex-1 flex-col">
          {children}
        </div>
      </AccountContext.Provider>
    </SignOutContext.Provider>
  );
}

/**
 * The sentence the login card shows.
 *
 * Either a message this feature wrote for a person, or one generic line. Never a
 * raw exception: those carry paths, status codes and, on this particular flow,
 * fragments of an identity token.
 *
 * The test is the **type**, not the text. It used to match on the start of the
 * string, and three real failures had copy that could therefore never appear:
 * Google's own error codes, the wallet shape refusal, and a missing session all
 * failed the match and were replaced by the generic line, silently. A type
 * cannot drift out of step with itself. `reason`, the accurate half, goes to the
 * console instead and is what a bug report should quote.
 */
function readable(err: unknown): string {
  return isSignInError(err) ? err.message : "Sign in failed. Please try again.";
}
