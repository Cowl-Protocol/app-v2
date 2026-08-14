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
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useCreateWallet,
  useLoginWithOAuth,
  usePrivy,
  useSignMessage,
  useWallets,
  type ConnectedWallet,
} from "@privy-io/react-auth";
import { SignInError } from "../errors";
import { ANCHOR_INDEX, type ShieldedSigner, type WalletSession } from "../signer";

/**
 * The wallet kinds Privy provisions and holds itself.
 *
 * An injected wallet a user happened to connect is **not** one of these and must
 * never be picked: this app's whole shape is that the user needed no wallet to
 * arrive, and deriving a shielded account from a browser extension's key would
 * put the balance somewhere the next session cannot reach.
 */
const EMBEDDED: readonly string[] = ["privy", "privy-v2"];

function isEmbedded(wallet: ConnectedWallet): boolean {
  return EMBEDDED.includes(wallet.walletClientType);
}

/**
 * The wallet at one HD index: found, absent, or too many to choose from.
 *
 * **Selection is by index and an ambiguous answer is refused rather than
 * guessed at.** The previous adapter got this guarantee by matching a wallet by
 * name, and it is worth restating because the failure it prevents is silent and
 * unrecoverable: every Ethereum keyring has an account at index 0, so picking
 * `wallets[0]` yields an address, the unlock signature recovers to that address,
 * every check in `unlock.ts` passes, and a valid and permanently empty shielded
 * account is derived. Being unable to sign in is a bad afternoon. Deriving the
 * wrong account looks exactly like theft.
 *
 * **It returns the refusal rather than throwing it, and that is not a style
 * choice.** This runs during render. A throw there unmounts the tree with no
 * error boundary above it, so the user gets a white screen instead of the
 * sentence this refusal exists to show them · a check that protects money by
 * making the app disappear has traded one silent failure for another.
 */
type Lookup =
  | { found: ConnectedWallet }
  | { found: null }
  | { found: null; ambiguous: number };

function walletAt(wallets: ConnectedWallet[], index: number): Lookup {
  const matches = wallets.filter(
    (w) => isEmbedded(w) && (w as ConnectedWallet & { walletIndex?: number | null }).walletIndex === index,
  );

  if (matches.length === 1) return { found: matches[0]! };
  if (matches.length === 0) return { found: null };
  return { found: null, ambiguous: matches.length };
}

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
  const problem =
    walletsReady && "ambiguous" in anchorLookup
      ? ambiguityError(ANCHOR_INDEX, anchorLookup.ambiguous).message
      : null;

  /**
   * Whether an anchor has already been asked for.
   *
   * A ref rather than state because it has to be true the instant it is set.
   * Creating a wallet is a write, `useWallets` re-renders while it is in flight,
   * and a flag that landed on the next render would let a second creation start
   * against a keyring that already had one on the way.
   */
  const provisioning = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    if (signer || provisioning.current || problem) return;

    provisioning.current = true;
    /*
      A brand new user has an identity and no keyring yet. `createOnLogin` in the
      provider config normally covers this, so reaching here means either that
      setting is off or the creation did not happen · in both cases doing it
      explicitly is the difference between a working sign in and a spinner.

      The failure is swallowed on purpose: `useSignIn` reports the refusal a user
      can see, and this effect has no screen. Letting the flag fall back means
      the next render tries again rather than sticking.
    */
    void createWallet()
      .catch(() => {})
      .finally(() => {
        provisioning.current = false;
      });
  }, [ready, authenticated, walletsReady, signer, problem, createWallet]);

  const begin = useCallback(async () => {
    await initOAuth({ provider: "google" });
  }, [initOAuth]);

  const end = useCallback(async () => {
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
