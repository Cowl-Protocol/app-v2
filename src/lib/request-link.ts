/**
 * The payment request link: what `request` writes and what `pay` reads.
 *
 * **Why this is in `lib` and not in either feature.** Both sides need the exact
 * same codec, and a feature cannot reach into another feature's internals. Put
 * it in `request` and `pay` has to import it; put it in `pay` and the panel that
 * *creates* links depends on the screen that spends them. It holds no secret and
 * no key, the same argument that puts `payment-address.ts` here.
 *
 * **The payload lives in the URL fragment and this is load bearing.** A fragment
 * is never sent in an HTTP request, so the host serving the page never learns
 * the payment address, the amount, or that a request exists at all. In the path
 * or the query string, every one of those lands in a web log, which would hand
 * away the whole point of the product to the thing hosting it. `encodeRequest`
 * returns the fragment body only, and callers must not be tempted to put it
 * anywhere else.
 *
 * **The link is stateless.** No request id, no row in a database, nothing
 * stored. There is no record to lose, to leak, or to be asked for, and the page
 * works from a static host with no server behind it.
 */

/**
 * Wire shape. Short keys because this ends up in a URL somebody pastes into a
 * chat window, and a link that wraps across three lines gets truncated by hand.
 */
export type RequestPayload = {
  /** Format version. A payer that does not recognise it must refuse, not guess. */
  v: 1;
  /** EVM chain id. See the note on `chain` below — this field is not optional. */
  chain: number;
  /** The recipient's `zcowl1…`. */
  to: string;
  /** Ticker, for display and for resolving decimals on the paying side. */
  token: string;
  /**
   * Whole tokens as a decimal string, not base units.
   *
   * Base units would be exact but they are only meaningful next to a decimals
   * figure, and if the two clients disagree about a token the link renders as a
   * number off by twelve orders of magnitude before anyone has clicked anything.
   * Whole tokens always display as what the recipient typed, and the conversion
   * to base units happens once, on the paying side, against the decimals the
   * chain itself reports for that token.
   */
  amount: string;
  /**
   * What the payment is for, shown to the payer only.
   *
   * **There is no memo field on chain and none is being added.** This exists to
   * render a screen. It must never be described anywhere as travelling with the
   * money, because a person who believes it does will put something in it that
   * they needed the recipient to see.
   */
  label?: string;
};

/**
 * `chain` is required, and that is a fix rather than an oversight.
 *
 * A `zcowl1…` is `<mpk><viewPub>` and nothing else, so a testnet address and a
 * mainnet address are indistinguishable by inspection. The address cannot carry
 * the chain, so the link has to, and a payer surface must refuse to pay on a
 * chain the link does not name. Without this a testnet request is payable with
 * real money and nothing anywhere would say so.
 */

const MAX_LABEL = 80;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The fragment body for a request. The caller adds the `#`. */
export function encodeRequest(payload: RequestPayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * Parse a fragment body back into a request, or return null.
 *
 * Null rather than a thrown error, because the only caller is a screen deciding
 * whether it is looking at a payment link at all, and every wrong answer here is
 * ordinary: a truncated paste, a stale format, somebody's `#section` anchor. A
 * malformed link is not an exception, it is one of the two expected outcomes.
 *
 * Validation is deliberately shallow and stops at shape. Whether `chain` is a
 * chain this build knows, and whether `token` is a token that exists on it, are
 * questions about the deployment rather than about the string, and answering
 * them here would put the network table behind a codec.
 */
export function decodeRequest(fragment: string): RequestPayload | null {
  const body = fragment.replace(/^#/, "").trim();
  if (!body) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;

  if (p.v !== 1) return null;
  if (typeof p.chain !== "number" || !Number.isInteger(p.chain) || p.chain <= 0) return null;
  if (typeof p.to !== "string" || !p.to) return null;
  if (typeof p.token !== "string" || !p.token) return null;
  // Digits with at most one point. Not a number: the string goes on to become a
  // bigint, and passing it through a float is where the last places go missing.
  if (typeof p.amount !== "string" || !/^\d+(\.\d+)?$/.test(p.amount)) return null;
  if (p.label !== undefined && typeof p.label !== "string") return null;

  return {
    v: 1,
    chain: p.chain,
    to: p.to,
    token: p.token,
    amount: p.amount,
    // Truncated rather than rejected. A label is decoration on a screen and an
    // over-long one is a paste accident, not an attack, but it is attacker
    // controlled text and it is not going to be given the whole layout.
    label: typeof p.label === "string" ? p.label.slice(0, MAX_LABEL) : undefined,
  };
}

/**
 * The path a payment link points at, written once.
 *
 * Both halves have to agree and they live in different features, so the string
 * belongs beside the function that builds the link rather than in each of them.
 * Changing it here changes every link the app emits; the route file under
 * `app/pay` is the other half and has to move with it.
 */
export const PAY_PATH = "/pay";

/** The full link, for copying. `origin` carries no trailing slash. */
export function requestLink(origin: string, payload: RequestPayload): string {
  return `${origin}${PAY_PATH}#${encodeRequest(payload)}`;
}
