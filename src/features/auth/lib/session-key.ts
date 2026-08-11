/**
 * The session keypair, and the stamp Turnkey checks every request against.
 *
 * Turnkey does not use bearer tokens. Every call is signed by a P-256 key the
 * client holds, and the signature travels in an `X-Stamp` header. The session
 * JWT that comes back from login is metadata about which key was blessed and for
 * how long; it authorises nothing on its own. **The key is the session.**
 *
 * Which is why this file looks the way it does.
 *
 * **The private key is non-extractable and never leaves WebCrypto.** It is
 * generated with `extractable: false`, so there is no code path, ours or an
 * attacker's, that can read its bytes out of the browser. Script running on this
 * origin can ask it to sign while the tab is open and can do nothing with it
 * afterwards.
 *
 * **It is held in a module variable and nowhere else.** No IndexedDB, which is
 * what Turnkey's own stamper uses and what its SDK defaults to. That default is
 * defensible for an ordinary wallet and wrong here: this key can ask Turnkey to
 * sign the shielded unlock message, and that message derives the **view key**,
 * which reads the whole payment history backwards and cannot be rotated. A
 * persisted session is therefore a persisted route back to an unrotatable
 * secret, sitting on the disk of a device that may be stolen with no tab open.
 * The cost is one sign in per tab, which is the same cost the shielded key
 * already imposes and the same rule README states.
 *
 * The consequence worth knowing before changing anything here: because the key
 * dies with the page, **the OAuth round trip cannot be a redirect**. A redirect
 * reloads the app, the key is gone, and Google's nonce was bound to it. The
 * popup in `google.ts` is not a stylistic choice, it is what this file costs.
 */
import { SignInError } from "./errors";

/**
 * A generated session keypair. `publicKeyHex` is the compressed SEC1 point, hex,
 * 33 bytes, which is the form Turnkey's stamp and nonce both expect.
 */
type SessionKey = {
  publicKeyHex: string;
  privateKey: CryptoKey;
};

let current: SessionKey | null = null;

/**
 * Generate a fresh session keypair, discarding any previous one.
 *
 * Called at the start of every sign in rather than reused, so a failed attempt
 * never leaves a key behind that a later attempt could bind to a different
 * identity's token.
 */
export async function createSessionKey(): Promise<string> {
  // `crypto.subtle` is undefined outside a secure context, so on a plain `http://`
  // host that is not localhost this whole app is inert: no session key, no
  // stamp, no proof later either. A static export can be dropped on any web
  // root, which makes that a real deployment rather than a hypothetical, and the
  // TypeError it otherwise throws surfaces as "sign in failed, please try
  // again", which is advice that cannot work.
  if (!globalThis.crypto?.subtle) {
    throw new SignInError(
      "This app needs a secure connection. Open it over https and try again.",
      "crypto.subtle is unavailable, so this is not a secure context",
    );
  }

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    // The private half must never be readable. The public half is exportable
    // regardless, which is what the line below relies on.
    false,
    ["sign", "verify"],
  );

  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const publicKeyHex = compressP256(raw);

  current = { publicKeyHex, privateKey: pair.privateKey };
  return publicKeyHex;
}

/** The public key of the live session, or null before sign in and after sign out. */
export function sessionPublicKey(): string | null {
  return current?.publicKeyHex ?? null;
}

/**
 * Forget the session key.
 *
 * This is the whole of signing out on the client side. There is nothing else to
 * clear because nothing else was written down, and once the reference is dropped
 * the private key is unreachable even to this tab.
 */
export function clearSessionKey(): void {
  current = null;
}

/**
 * Sign a request body and return the header Turnkey expects.
 *
 * The shape is fixed by Turnkey: base64url of `{publicKey, scheme, signature}`,
 * where the signature is DER over the exact bytes of the JSON body being sent.
 * Exact matters. Re-stringifying the body anywhere between here and `fetch`
 * changes the bytes and the stamp stops verifying.
 */
export async function stamp(body: string): Promise<{ name: string; value: string }> {
  if (!current) {
    throw new Error("No session. Sign in before calling Turnkey.");
  }

  const ieee = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      current.privateKey,
      new TextEncoder().encode(body),
    ),
  );

  const stampJson = JSON.stringify({
    publicKey: current.publicKeyHex,
    scheme: "SIGNATURE_SCHEME_TK_API_P256",
    signature: toHex(ieee1363ToDer(ieee)),
  });

  return { name: "X-Stamp", value: base64url(stampJson) };
}

/* ------------------------------------------------------------------------- *
 * encoding
 *
 * All four helpers below are format plumbing with one correct answer each, and
 * all four are checked by `npm run test:auth` against vectors that do not come
 * from this file.
 * ------------------------------------------------------------------------- */

/**
 * SEC1 uncompressed point, 65 bytes, to compressed, 33 bytes.
 *
 * The prefix records whether Y was even or odd, which is all a verifier needs to
 * recover the point it was dropped from.
 */
function compressP256(raw: Uint8Array): string {
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error("Expected an uncompressed SEC1 point from WebCrypto.");
  }
  const x = raw.subarray(1, 33);
  const yIsOdd = (raw[64]! & 1) === 1;
  const out = new Uint8Array(33);
  out[0] = yIsOdd ? 0x03 : 0x02;
  out.set(x, 1);
  return toHex(out);
}

/**
 * WebCrypto returns ECDSA signatures as IEEE P1363, a flat `r || s`. Turnkey
 * wants DER, the same conversion Turnkey's own stampers perform.
 *
 * The fiddly part is DER's integers being signed: a leading byte of 0x80 or
 * higher would read as negative, so it gets a zero byte in front, and leading
 * zeroes that are not doing that job have to come off.
 */
function ieee1363ToDer(ieee: Uint8Array): Uint8Array {
  if (ieee.length === 0 || ieee.length % 2 !== 0) {
    throw new Error(`Invalid P1363 signature length: ${ieee.length}`);
  }
  const half = ieee.length / 2;
  const r = derInteger(ieee.subarray(0, half));
  const s = derInteger(ieee.subarray(half));

  const body = new Uint8Array(2 + r.length + 2 + s.length);
  let i = 0;
  body[i++] = 0x02;
  body[i++] = r.length;
  body.set(r, i);
  i += r.length;
  body[i++] = 0x02;
  body[i++] = s.length;
  body.set(s, i);

  // P-256 never reaches the long form, but the check is cheap and a silent
  // truncation here would produce a stamp that fails with no clue why.
  if (body.length > 127) {
    throw new Error("DER body too long for the short form length byte.");
  }

  const der = new Uint8Array(2 + body.length);
  der[0] = 0x30;
  der[1] = body.length;
  der.set(body, 2);
  return der;
}

function derInteger(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const trimmed = bytes.subarray(start);
  if ((trimmed[0]! & 0x80) === 0) return trimmed;
  const padded = new Uint8Array(trimmed.length + 1);
  padded.set(trimmed, 1);
  return padded;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * base64url of a UTF-8 string. `btoa` works on latin1, so the text goes through
 * TextEncoder first rather than being handed to `btoa` directly, which would
 * throw on any non-ascii byte a Turnkey field might one day carry.
 */
function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Exported for the test script only. Not part of the feature's public surface. */
export const __encoding = { compressP256, ieee1363ToDer, base64url, toHex };
