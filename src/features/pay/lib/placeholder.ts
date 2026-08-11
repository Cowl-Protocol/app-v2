/**
 * **Placeholder data for the payer's screen. No chain, no wallet, no key.**
 *
 * Smaller than the other placeholder modules because most of this screen is not
 * invented: a real request arrives in the URL fragment, and pasting a link
 * produced by the Request panel renders the genuine article. What is here is the
 * token table, which stands in for reading a token's own decimals, and the one
 * request used when there is no link at all.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { hashToField } from "@/lib/field";
import { encodePaymentAddress } from "@/lib/payment-address";
import type { RequestPayload } from "@/lib/request-link";
import type { TokenTable } from "./resolve";

/**
 * Decimals per ticker.
 *
 * In the wired version this is a call to the token, not a table. It is written
 * down here so the screen can be laid out, and it is exactly the kind of
 * constant that is dangerous if it survives: a token whose real decimals differ
 * from this would render an amount off by orders of magnitude while looking
 * completely ordinary.
 */
/** Drives the SAMPLE marker, exactly as it does on the Receive panel. */
export const IS_PLACEHOLDER = true;

export const KNOWN_TOKENS: TokenTable = {
  USDG: 6,
  ETH: 18,
  COWL: 18,
  AAPL: 18,
};

/**
 * The request shown under `PREVIEW = "pay"`, when no link is in the address bar.
 *
 * **The destination is built, never pasted.** A hand written `zcowl1…` fails its
 * own checksum, which is the format working as designed, and the screen would
 * render the refusal rather than the request it exists to show. It is also
 * derived from a fixed phrase, so the `sk` behind it exists in no wallet: this
 * screen carries a Pay button, and a sample that could actually be paid is a
 * sample that eventually is.
 *
 * Restated rather than imported from the request feature. A feature cannot reach
 * into another feature's internals, and the two modules delete on the same day.
 */
const SAMPLE_TO = encodePaymentAddress(
  hashToField(utf8ToBytes("cowl:app-v2:placeholder:pay:mpk")),
  "02" + bytesToHex(keccak_256(utf8ToBytes("cowl:app-v2:placeholder:pay:view"))),
);

/** Testnet on purpose, so the test chain warning is on screen where it can be looked at. */
export const SAMPLE_REQUEST: RequestPayload = {
  v: 1,
  chain: 46630,
  to: SAMPLE_TO,
  token: "USDG",
  amount: "500",
  label: "Invoice 0042",
};
