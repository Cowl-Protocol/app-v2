/**
 * Reading the claims out of a JWT, without checking its signature.
 *
 * Both tokens this app handles are verified by somebody with a better position
 * to do it. Google's identity token is verified inside Turnkey's enclave against
 * Google's live keys, and Turnkey's session token authorises nothing at all,
 * because every request is authorised by the stamp instead. So this is a
 * decoder, not a validator, and there is nothing here for a verifier to be
 * missing from.
 *
 * The two details that would otherwise be quiet bugs:
 *
 * **Padding.** base64url drops the `=` that `atob` counts on. A payload whose
 * length lands on the wrong side of four throws, and JWT payload lengths depend
 * on the claims, so it would fail for some users and not others.
 *
 * **Encoding.** `atob` produces one character per byte, which is latin1. A claim
 * with any non-ascii character in it, which an email or a name can have, decodes
 * to mojibake unless the bytes go back through a UTF-8 decoder.
 */
export function decodeClaims(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Malformed token.");

  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof claims !== "object" || claims === null) throw new Error("Malformed token.");
  return claims as Record<string, unknown>;
}
