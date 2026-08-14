/**
 * Which wallet on a keyring this app is allowed to use, as a pure function.
 *
 * **It lives on its own so it can be tested without the SDK.** The selection
 * below is the most dangerous decision in the adapter · picking the wrong wallet
 * derives a valid, permanently empty shielded account and every check downstream
 * still passes · and until this file existed it had no test at all, because the
 * only copy sat inside a `"use client"` module that pulls the whole vendor in.
 *
 * Nothing here imports the provider. `KeyringWallet` is the shape the vendor's
 * connected wallet already has, named structurally, so the adapter passes its
 * array straight in and this file never learns whose array it is.
 */

/**
 * The part of a connected wallet that selection depends on.
 *
 * Deliberately three fields. A wider type would let a future check reach for
 * something only one provider has, which is how a port stops being one.
 */
export type KeyringWallet = {
  walletClientType: string;
  address: string;
  /**
   * The HD index, when the provider reports one.
   *
   * **Optional, and that is the whole reason the refusals below exist.** It is
   * documented as applying only to wallets the provider holds itself, so an
   * injected wallet has none, and a provider that changed how it populates this
   * would silently stop matching rather than fail.
   */
  walletIndex?: number | null;
};

/**
 * The wallet kinds the provider provisions and holds itself.
 *
 * An injected wallet a user happened to connect is **not** one of these and must
 * never be picked: this app's whole shape is that the user needed no wallet to
 * arrive, and deriving a shielded account from a browser extension's key would
 * put the balance somewhere the next session cannot reach.
 */
export const EMBEDDED: readonly string[] = ["privy", "privy-v2"];

export function isEmbedded(wallet: KeyringWallet): boolean {
  return EMBEDDED.includes(wallet.walletClientType);
}

/**
 * The wallet at one HD index: found, absent, or too many to choose from.
 *
 * **Selection is by index and an ambiguous answer is refused rather than guessed
 * at.** The failure this prevents is silent and unrecoverable: every Ethereum
 * keyring has an account at index 0, so picking `wallets[0]` yields an address,
 * the unlock signature recovers to that address, every check in `unlock.ts`
 * passes, and a valid and permanently empty shielded account is derived. Being
 * unable to sign in is a bad afternoon. Deriving the wrong account looks exactly
 * like theft.
 *
 * A wallet reporting no index matches nothing, including index 0. That is not an
 * oversight to tidy up later: `undefined` means the provider did not tell us
 * where this wallet sits, and treating "unknown" as "zero" is the guess this
 * function exists to refuse.
 */
export type Lookup =
  | { found: KeyringWallet }
  | { found: null }
  | { found: null; ambiguous: number };

export function walletAt(wallets: readonly KeyringWallet[], index: number): Lookup {
  const matches = wallets.filter((w) => isEmbedded(w) && w.walletIndex === index);

  if (matches.length === 1) return { found: matches[0]! };
  if (matches.length === 0) return { found: null };
  return { found: null, ambiguous: matches.length };
}

/**
 * What the keyring actually looked like, for a log line and nothing else.
 *
 * **No addresses.** This exists because whether a provider populates
 * `walletIndex` on the wallet it creates at login is its behaviour rather than
 * its promise, and the first live sign in is the only thing that can answer it.
 * Without this the answer is a spinner; with it the answer is one line. An
 * address would make that line a record of who was signing in, which is the one
 * thing this app is built not to write down.
 */
export function describeKeyring(wallets: readonly KeyringWallet[]): string {
  if (wallets.length === 0) return "the provider reported no wallets";
  return wallets
    .map((w) => `${w.walletClientType}@${w.walletIndex ?? "no index"}`)
    .join(", ");
}
