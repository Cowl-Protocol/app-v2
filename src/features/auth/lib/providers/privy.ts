"use client";

/**
 * Privy, behind the `ShieldedSigner` port.
 *
 * **The only file in this app that knows the vendor's name.** Everything else
 * asks a `ShieldedSigner` for the anchor address, a signature, or the address at
 * an index, which is the whole surface a wallet provider has to present here.
 * Replacing Privy means rewriting this file and `config/auth.ts`, and nothing
 * that derives a key.
 *
 * **Two properties of this provider are not its documented promises**, and both
 * decide whether a shielded balance is reachable at all:
 *
 *   · Signatures must be **deterministic**, or every session derives a different
 *     shielded account and the balance reads zero with nothing to read.
 *   · They must be **RFC 6979**, or accounts are stable here and fork from the
 *     dapp, and one wallet opens two different balances depending on which
 *     client holds it.
 *
 * `npm run probe:privy` answers both against a real organization. `unlock.ts`
 * signs twice and refuses on a mismatch, which covers the first at runtime and
 * **cannot cover the second at all** · two signatures in one session agree
 * happily while the account space has silently moved. That is why the probe
 * freezes a value across days rather than only comparing within a run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateWallet,
  useLoginWithOAuth,
  usePrivy,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth";
import { reportSignInFailure, SignInError } from "../errors";
import { ANCHOR_INDEX, type ShieldedSigner, type WalletSession } from "../signer";
import { describeKeyring, walletAt } from "./select";

/*
  `walletAt`, `isEmbedded` and the keyring description moved to `./select.ts` so
  they could be tested without loading the vendor SDK. The reasoning that shapes
  them lives with them; the refusal they feed is still built here, because its
  wording is this adapter's to own.
*/

/** The refusal an ambiguous keyring earns, in both halves. */
function ambiguityError(index: number, count: number): SignInError {
  return new SignInError(
    "This account has more than one wallet, so it cannot be opened safely. " +
      "Nothing was changed.",
    `expected one embedded wallet at HD index ${index}, found ${count}`,
  );
}

/**
 * A signer over the signed in user's Privy keyring, or null before one exists.
 *
 * Null covers three states that look the same from outside and want the same
 * treatment: nobody is signed in, Privy has not finished loading its wallets, or
 * the user has no embedded wallet at the anchor index yet. A caller waits in all
 * three, and `sign-in.ts` is what turns waiting into a screen.
 */
function usePrivySigner(): ShieldedSigner | null {
  const { wallets, ready } = useWallets();
  const { signMessage } = useSignMessage();
  const { createWallet } = useCreateWallet();

  const lookup = useMemo(
    () => (ready ? walletAt(wallets, ANCHOR_INDEX) : { found: null }),
    [wallets, ready],
  );
  const anchor = lookup.found;

  /**
   * Sign with the anchor **by address**, never by letting the SDK choose.
   *
   * `signMessage` falls back to the first wallet when no address is given, and
   * the first wallet is whatever the array happens to hold · an injected wallet
   * the user connected for something else would do. The address is passed on
   * every call for the same reason `walletAt` refuses to pick.
   *
   * `showWalletUIs: false` is not cosmetic either. Privy renders a confirmation
   * modal by default, and unlocking signs twice, so leaving it on would ask a
   * user to approve two dialogs they have no way to evaluate for an operation
   * they already asked for by signing in.
   */
  const sign = useCallback(
    async (message: string): Promise<string> => {
      if (!anchor) {
        throw new SignInError(
          "Your account is not ready yet. Please try again in a moment.",
          "signMessage called with no wallet at the anchor index",
        );
      }
      const { signature } = await signMessage(
        { message },
        { address: anchor.address, uiOptions: { showWalletUIs: false } },
      );
      return signature;
    },
    [anchor, signMessage],
  );

  /**
   * The address at an HD index, creating it if this keyring has not reached it.
   *
   * Idempotent, which the port requires: an index that already exists is
   * returned rather than created a second time. Privy derives from the same seed
   * inside its TEE, so every index is recoverable from the same login and
   * nothing about an issued address is stored here.
   */
  const addressAt = useCallback(
    async (index: number): Promise<`0x${string}`> => {
      const at = walletAt(wallets, index);
      if (at.found) return at.found.address as `0x${string}`;
      if ("ambiguous" in at) throw ambiguityError(index, at.ambiguous);

      const created = await createWallet({ walletIndex: index });
      return created.address as `0x${string}`;
    },
    [wallets, createWallet],
  );

  return useMemo(
    () =>
      anchor
        ? {
            anchorAddress: anchor.address as `0x${string}`,
            signMessage: sign,
            addressAt,
          }
        : null,
    [anchor, sign, addressAt],
  );
}

/**
 * The whole provider session, which is everything `sign-in.ts` is allowed to
 * know about Privy.
 *
 * **The anchor is provisioned here rather than by the caller**, and that is the
 * boundary earning its keep. "A signed in user has a keyring with an account at
 * index 0" is a fact about this provider: Privy can be configured to create one
 * at login, an account provisioned elsewhere might not have one, and a caller
 * that had to know which was which would be reimplementing the adapter one
 * `walletIndex` at a time.
 */
export function usePrivyWalletSession(): WalletSession {
  const { ready, authenticated, user, logout } = usePrivy();
  const { initOAuth, loading } = useLoginWithOAuth();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const signer = usePrivySigner();

  /*
    An anchor this app refuses to choose between. Carried as a message rather
    than thrown, because the only place this is knowable is during render · see
    `walletAt`. `useSignIn` turns it into a refusal on the login card.
  */
  const anchorLookup = walletAt(wallets, ANCHOR_INDEX);
  const ambiguity =
    walletsReady && "ambiguous" in anchorLookup
      ? ambiguityError(ANCHOR_INDEX, anchorLookup.ambiguous).message
      : null;

  /**
   * Why provisioning the anchor stopped, or null while it has not.
   *
   * **This exists because the failure it carries used to be invisible, and the
   * shape is one this project keeps producing.** The creation below was fired
   * and forgotten with its rejection swallowed, so a keyring that never yielded
   * an anchor left `signer` null forever · which `useSignIn` reads as "still
   * unlocking" and the login card renders as a spinner on the Google button.
   * Every layer behaved correctly and the person waited on a screen that was
   * never going to change, with nothing written anywhere saying why.
   */
  const [provisionFailure, setProvisionFailure] = useState<SignInError | null>(null);

  /**
   * The identity provisioning has already been attempted for.
   *
   * A ref rather than state because it has to be true the instant it is set:
   * creating a wallet is a write, `useWallets` re-renders while it is in flight,
   * and a flag that landed on the next render would let a second creation start
   * against a keyring that already had one on the way.
   *
   * **One attempt per identity, not one per render.** Resetting this in a
   * `finally` meant a creation that failed was retried on every later render for
   * as long as the tab stayed open, against a provider that answers the second
   * call with the same refusal as the first. Signing out clears it, which is
   * what keeps a transient failure recoverable without making a permanent one a
   * loop.
   */
  const attempted = useRef<string | null>(null);
  const identity = user?.id ?? null;

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    if (signer || ambiguity) return;
    if (identity === null || attempted.current === identity) return;

    attempted.current = identity;
    /*
      A brand new user has an identity and no keyring yet. `createOnLogin` in the
      provider config normally covers this, so reaching here means either that
      setting is off or the creation did not happen · in both cases doing it
      explicitly is the difference between a working sign in and a spinner.
    */
    void createWallet()
      .then((created) => {
        /*
          Created, and still not usable · the case worth naming out loud. Which
          index a provider stamps on the wallet it just made is its behaviour
          rather than its promise, so a keyring answering with no index, or with
          a different one, would otherwise land in the same silent wait as an
          outright failure. Refusing is the only honest answer available here:
          taking whatever wallet is present instead is precisely the guess
          `walletAt` exists to refuse, and it derives a valid, permanently empty
          account that looks exactly like theft.
        */
        const at = (created as { walletIndex?: number | null }).walletIndex;
        if (at === ANCHOR_INDEX) return;
        setProvisionFailure(
          new SignInError(
            "Your account could not be opened, so nothing was unlocked. " +
              "Sign out and try again.",
            `provider created a wallet reporting index ${String(at ?? "none")}, ` +
              `expected ${ANCHOR_INDEX} · keyring: ${describeKeyring(wallets)}`,
          ),
        );
      })
      .catch((err: unknown) => {
        setProvisionFailure(
          new SignInError(
            "Your account could not be opened, so nothing was unlocked. " +
              "Sign out and try again.",
            `creating the wallet at index ${ANCHOR_INDEX} failed: ` +
              `${err instanceof Error ? err.message : String(err)} · ` +
              `keyring: ${describeKeyring(wallets)}`,
          ),
        );
      });
  }, [
    ready,
    authenticated,
    walletsReady,
    signer,
    ambiguity,
    identity,
    createWallet,
    wallets,
  ]);

  /*
    The reason goes to the console the same way every other sign in failure does,
    because the message a user is shown deliberately carries no diagnosis and the
    first live sign in against a provider is the only thing that can answer what
    it reports. `describeKeyring` names client types and indices and never an
    address.
  */
  useEffect(() => {
    if (provisionFailure) reportSignInFailure(provisionFailure);
  }, [provisionFailure]);

  /*
    Ambiguity first: it is knowable during the render that detects it, while a
    provisioning failure is only knowable after a round trip, so reporting the
    later one over the earlier would describe the second-best reason.
  */
  const problem = ambiguity ?? provisionFailure?.message ?? null;

  const begin = useCallback(async () => {
    await initOAuth({ provider: "google" });
  }, [initOAuth]);

  const end = useCallback(async () => {
    /*
      Clearing both is what makes a failed provisioning recoverable. The attempt
      is capped at one per identity, so without this a person who hit a transient
      failure would be handed the same refusal for the life of the tab.
    */
    attempted.current = null;
    setProvisionFailure(null);
    await logout();
  }, [logout]);

  return useMemo(
    () => ({
      ready,
      authenticated,
      /*
        Read straight off the user record. Privy has already verified the
        identity with Google, so decoding a token here would be re-deriving a
        fact we were handed. `name` and the avatar url are on that record too and
        are deliberately not taken: an avatar would turn every page view into a
        request to googleusercontent.com from an app built so nothing can log a
        session.
      */
      email: user?.google?.email ?? "",
      signer,
      problem,
      begin,
      starting: loading,
      end,
    }),
    [ready, authenticated, user, signer, problem, begin, loading, end],
  );
}
