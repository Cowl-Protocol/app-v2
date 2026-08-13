/**
 * **Placeholder data for the payer's screen. No chain, no wallet, no key.**
 *
 * Smaller than the other placeholder modules, and it just got smaller again.
 * Most of this screen is not invented: a real request arrives in the URL
 * fragment, and pasting a link produced by the Request panel renders the genuine
 * article. The token table that used to sit here has moved to `config/tokens`,
 * where it is a registry read off the deployments it describes rather than four
 * tickers written down beside a mock. What is left is the one request used when
 * there is no link at all.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { NETWORKS } from "@/config";
import { hashToField } from "@/lib/field";
import { encodePaymentAddress } from "@/lib/payment-address";
import type { RequestPayload } from "@/lib/request-link";

/** Drives the SAMPLE marker, exactly as it does on the Receive panel. */
export const IS_PLACEHOLDER = true;

/**
 * The request shown when no link is in the address bar.
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

/**
 * On the test chain on purpose, so the test chain warning is on screen where it
 * can be looked at, whichever network this build targets.
 *
 * Named rather than numbered. The chain id used to be written here as 46630,
 * which is the same value right up until it is not, and a magic number in a
 * sample is a magic number somebody copies into something that matters.
 */
export const SAMPLE_REQUEST: RequestPayload = {
  v: 1,
  chain: NETWORKS["robinhood-testnet"].chainId,
  to: SAMPLE_TO,
  token: "USDG",
  amount: "500",
  label: "Invoice 0042",
};
