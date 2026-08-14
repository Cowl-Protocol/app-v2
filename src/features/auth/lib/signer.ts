/**
 * What the shielded account needs from whoever holds the Ethereum key.
 *
 * **This file exists because the last swap cost a feature and the next one
 * should cost a file.** `unlock.ts` and `funnel.ts` each used to import
 * `turnkey.ts` directly, so replacing the vendor meant rewriting the code that
 * derives keys · the most dangerous code in this app · for a reason that had
 * nothing to do with derivation. The port below is the whole surface a wallet
 * provider has to present. A provider lives under `lib/providers/` and implements
 * it, and nothing else in this feature learns the vendor's name.
 *
 * It is deliberately **narrow, and it is not an auth abstraction**. Signing in is
 * a login screen, a redirect and a session, and every provider shapes those
 * differently enough that a common interface over them would be a lie that costs
 * more than it saves. What is worth abstracting is the part where a wrong answer
 * costs money rather than an afternoon: which key signs, what bytes come back,
 * and which address sits at an index.
 */

/**
 * The account that signs the shielded unlock message.
 *
 * **Zero, and it is never handed to anybody.** The signature over
 * `SHIELDED_SIGN_MESSAGE` by this account is the seed of the entire shielded
 * balance, so an anchor seen receiving in public ties a transfer to the account
 * that balance derives from. It signs, and it stays off chain.
 */
export const ANCHOR_INDEX = 0;

/**
 * The first receiving address, and every funnel after it.
 *
 * Funnels start at one because zero is the anchor. A `zcowl1…` can only be paid
 * by another Cowl client, so an exchange withdrawal form, a friend's wallet and a
 * bridge all need a plain `0x`, and this is where those come from.
 */
export const FIRST_FUNNEL_INDEX = 1;

/**
 * A wallet that can sign the unlock message and derive receiving addresses.
 *
 * Implemented once per provider. Everything here is asked of a live session and
 * nothing is stored: this app persists no secret, so a signer is a handle on
 * something that dies with the tab rather than a record of anything.
 */
export type ShieldedSigner = {
  /**
   * The address at `ANCHOR_INDEX`, which is what the unlock signature must
   * recover to.
   *
   * Present as a value rather than a call because `unlock.ts` compares against
   * it after every signature, and a check that can fail for a network reason is
   * a check people learn to retry past.
   */
  anchorAddress: `0x${string}`;

  /**
   * `personal_sign` over these exact bytes, by the anchor account.
   *
   * Returns the joined 65 byte signature as hex. **The bytes have to be
   * deterministic and they have to be RFC 6979**, or the shielded account moves
   * between sessions or forks from the dapp. Neither property is a provider's
   * documented promise · `npm run probe:privy` is what answers it, and
   * `unlock.ts` refuses at runtime for the half a probe cannot cover.
   */
  signMessage(message: string): Promise<string>;

  /**
   * The address at HD index `i`, derived on demand.
   *
   * The keyring is one seed, so every index is recoverable from the same login
   * and nothing about an issued address has to be written down. Implementations
   * must be idempotent: asking twice for the same index returns the same address
   * rather than creating a second account.
   */
  addressAt(index: number): Promise<`0x${string}`>;
};

/**
 * A live provider session, as the rest of this feature sees it.
 *
 * **The port covers the session and not the login screen.** Which buttons a
 * provider offers, what its modal looks like and how it words a refusal are all
 * things a common interface would flatten into a lie. What is worth abstracting
 * is the handful of facts sign in has to branch on, and the two actions it has
 * to take.
 */
export type WalletSession = {
  /** The provider has finished restoring whatever session it was holding. */
  ready: boolean;

  /** Somebody is signed in. */
  authenticated: boolean;

  /**
   * The label for the account control, or empty.
   *
   * Empty is normal and has to stay usable: an identity with no readable address
   * is still an identity, and a screen that required one would refuse a valid
   * sign in over a caption.
   */
  email: string;

  /**
   * The signer, once the keyring exists.
   *
   * Null covers three states that want the same treatment · nobody is signed in,
   * the provider has not finished loading, or the anchor is still being
   * provisioned for a new user. A caller waits in all three.
   */
  signer: ShieldedSigner | null;

  /**
   * A refusal that is only knowable while rendering, or null.
   *
   * Today the one case is a keyring this app will not choose between. It travels
   * as a message rather than an exception because the place it is detected is a
   * render, where a throw takes the tree down instead of showing the sentence.
   */
  problem: string | null;

  /**
   * Start signing in.
   *
   * **This may navigate the page away**, so nothing may be sequenced after it.
   * A provider that redirects returns the browser to a fresh page where the rest
   * of sign in happens on load rather than on a click.
   */
  begin: () => Promise<void>;

  /** True while a sign in is being started. */
  starting: boolean;

  /** End the session and clear anything the provider persisted. */
  end: () => Promise<void>;
};
