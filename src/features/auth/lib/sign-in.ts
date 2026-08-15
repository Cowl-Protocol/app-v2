"use client";

/**
 * Sign in, as one hook.
 *
 * **The shape of this file changed with the provider and the reason is worth
 * knowing.** It used to be a single imperative `signIn()`: open a popup, get a
 * token, take a session, sign, derive, return an account, all inside one click
 * handler. That worked because the whole round trip happened in a window beside
 * a page that never unloaded.
 *
 * The current provider signs in by **navigating away**. Its login call is a
 * redirect, Google returns the browser to this origin, and the app boots from
 * nothing with a session the provider has already restored. So there is no call
 * to await: the second half of sign in runs on a page load that did not start
 * with a click, and the only thing that can express that is state.
 *
 *   click  ->  session.begin()  ->  the page is gone
 *          ->  Google  ->  back to this origin, a fresh page
 *          ->  the provider reports ready and authenticated
 *          ->  a signer appears, once the anchor at HD index 0 exists
 *          ->  that account signs the unlock message, twice
 *          ->  shielded keys, derived in this tab
 *
 * **What the network sees.** Google learns that someone signed into our app,
 * which is what signing in with Google means. The provider learns the identity
 * and holds the Ethereum key. Neither learns the shielded keys, which are derived in
 * the last step from a signature that is never sent anywhere, and no server of
 * ours is in the path at all.
 *
 * **What is written to disk, and it is a real change.** The current provider
 * keeps its auth token in `localStorage` and its web SDK offers no way to put it
 * anywhere else.
 * That token outlives the tab, so a browser profile can re-derive the shielded
 * keys without going back to Google. The keys themselves are still memory only
 * and still die with the tab · what persists is the ability to derive them
 * again, and only on the user's own device. `useSignOut` clears it, which is why
 * signing out matters more here than it did before.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ShieldedKeys } from "@/features/keys";
import { isSignInError } from "./errors";
import { useWalletSession } from "./providers";
import type { ShieldedSigner } from "./signer";
import { unlockShieldedAccount } from "./unlock";

export type Account = {
  /** The Ethereum address the shielded account derives from. Never shown, never published. */
  address: `0x${string}`;
  /**
   * The live signer, kept so a receiving address can be issued later.
   *
   * It holds no secret · it is a handle on a provider session that can ask for a
   * signature or an address while the tab is open. The shielded keys beside it
   * are the secret, and they are the reason this record never leaves the feature
   * whole. See `account-context.ts`.
   */
  signer: ShieldedSigner;
  keys: ShieldedKeys;
  /** Only for the account control in the top bar. The address and the email stay off screen. */
  email: string;
};

/**
 * Where sign in has got to.
 *
 * `loading` covers two states a user cannot tell apart and should not have to:
 * the SDK is booting, and the browser has just come back from Google. Both are
 * "wait", and both end at the same place.
 */
export type SignInState =
  | { stage: "loading" }
  | { stage: "signed-out" }
  /** Authenticated, and deriving the shielded account. Two signatures happen here. */
  | { stage: "unlocking" }
  | { stage: "ready"; account: Account }
  | { stage: "failed"; message: string };

export type SignIn = SignInState & {
  /** Start the redirect. There is nothing to await · the page goes away. */
  begin: () => void;
  /** Drop the provider session and the shielded keys together. */
  signOut: () => void;
  /** True while the redirect is being started, so the button can say so. */
  pending: boolean;
};

/**
 * How many refused unlocks of one anchor before this stops asking.
 *
 * Three, because the failure worth retrying is a network blip and the one worth
 * reporting repeats. Each attempt costs two signatures, so the ceiling is also
 * what bounds a bad afternoon at six.
 */
const UNLOCK_ATTEMPTS = 3;

export function useSignIn(): SignIn {
  const session = useWalletSession();
  const { ready, authenticated, email, signer, problem, begin: start, starting, end } = session;

  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Which anchor address has already been unlocked.
   *
   * A ref rather than state because it must be true the instant it is set: this
   * gate stops a second unlock, and an unlock is two signatures. A state update
   * would not land until the next render and the effect would run again first,
   * which on a metered provider is real money and on any provider is a user
   * waiting twice.
   */
  const unlocked = useRef<string | null>(null);

  /**
   * How many times unlocking this anchor has been refused.
   *
   * **The retry below is deliberate and it needs a floor, which it did not have
   * on 2026-08-15 when a provider refusal turned into an endless loop.** Clearing
   * the guard on failure is right · a refusal is usually the provider having a
   * moment rather than the account being wrong. But an unlock signs twice, and a
   * refusal that repeats forever signs forever, hides its own reason (each
   * attempt clears the error the last one recorded) and renders as a door that
   * is thinking rather than one that has stopped.
   *
   * Counted per anchor so that signing out, or an account whose keyring changed,
   * starts again with a full allowance.
   */
  const refusals = useRef<{ anchor: string; count: number }>({ anchor: "", count: 0 });

  /**
   * Everything after the redirect, which is where the real work is.
   *
   * It runs on a page load rather than on a click, so it has to be idempotent
   * and it has to tolerate arriving before the provider has finished restoring
   * the session. Waiting on `signer` covers all of that in one condition: it is
   * null until somebody is signed in and their keyring has an anchor.
   */
  useEffect(() => {
    if (!signer) return;
    if (unlocked.current === signer.anchorAddress) return;
    if (
      refusals.current.anchor === signer.anchorAddress &&
      refusals.current.count >= UNLOCK_ATTEMPTS
    ) {
      return;
    }

    let live = true;
    unlocked.current = signer.anchorAddress;
    setError(null);

    unlockShieldedAccount(signer)
      .then((keys) => {
        if (!live) return;
        setAccount({ address: signer.anchorAddress, signer, keys, email });
      })
      .catch((err: unknown) => {
        if (!live) return;
        /*
          Let the next attempt through. A failed unlock is usually the provider
          refusing rather than the account being wrong, and a gate that stayed
          closed would make signing out and in again the only recovery from a
          network blip.
        */
        unlocked.current = null;
        refusals.current =
          refusals.current.anchor === signer.anchorAddress
            ? { anchor: signer.anchorAddress, count: refusals.current.count + 1 }
            : { anchor: signer.anchorAddress, count: 1 };
        reportSignInFailure(err);
        setError(isSignInError(err) ? err.message : "Sign in failed. Please try again.");
      });

    return () => {
      live = false;
    };
  }, [signer, email]);

  const begin = useCallback(() => {
    setPending(true);
    setError(null);
    /*
      No await, and nothing after it. This may navigate the page away, so any
      cleanup written here would run only when the redirect failed to start ·
      which is exactly the case the catch covers.
    */
    start().catch((err: unknown) => {
      setPending(false);
      reportSignInFailure(err);
      setError(
        isSignInError(err) ? err.message : "Sign in could not be started. Please try again.",
      );
    });
  }, [start]);

  /**
   * Signing out, which is three acts that have to happen together.
   *
   * `end` closes the provider session and clears whatever it persisted. Dropping
   * `account` is what releases the shielded keys, and that is the half that
   * cannot be skipped: the view key reads history backwards and cannot be
   * rotated, so leaving it live in a tab that says it is signed out is the worst
   * version of this bug rather than a cosmetic one. The ref is cleared so a
   * later sign in on the same page is not mistaken for one already done.
   */
  const signOut = useCallback(() => {
    unlocked.current = null;
    refusals.current = { anchor: "", count: 0 };
    setAccount(null);
    setError(null);
    void end();
  }, [end]);

  const state = ((): SignInState => {
    /*
      A provider level refusal outranks anything this hook recorded. It means the
      keyring is in a shape this app will not derive from, so retrying cannot fix
      it and no later state should paper over it.
    */
    if (problem) return { stage: "failed", message: problem };
    if (error) return { stage: "failed", message: error };
    if (account) return { stage: "ready", account };
    if (!ready) return { stage: "loading" };
    if (!authenticated) return { stage: "signed-out" };
    return { stage: "unlocking" };
  })();

  return { ...state, begin, signOut, pending: pending || starting };
}

/**
 * Say out loud why sign in stopped, without saying it on screen.
 *
 * Kept beside the flow rather than in `errors.ts` so that the one `console` call
 * in `src/` sits where the failures it describes happen. Nothing secret passes
 * through: the reasons name an address, a status, or a curve property, never a
 * key, a signature or a token.
 */
function reportSignInFailure(err: unknown): void {
  if (isSignInError(err)) {
    console.warn(`[cowl] sign in stopped: ${err.reason}`);
    return;
  }
  console.warn("[cowl] sign in stopped:", err);
}
