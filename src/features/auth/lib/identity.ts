/**
 * Reading the two claims this app wants out of a Google identity token.
 *
 * **The token is not verified here and must not be trusted here.** Turnkey
 * verifies it inside an enclave, against Google's live signing keys, and that is
 * the check that decides who the user is. What this file produces is a label for
 * the account control and a name for the sub-organization. If a forged token got
 * this far it would put a wrong word in the corner of the screen and then fail
 * at Turnkey, which is the correct order for those two things to happen in.
 *
 * `email` and `sub` are the only claims taken. `name` and `picture` are in the
 * token too, and the avatar in particular would turn every page view into a
 * request to `googleusercontent.com` from an app built so that nothing can log a
 * session. That decision is already recorded against the top bar and this is the
 * file that could quietly undo it.
 */
import { decodeClaims } from "./jwt";

export type Identity = {
  /** The `email` claim, or empty. Empty is normal and must stay usable. */
  email: string;
  /**
   * Something non-empty to name the user and their organization by.
   *
   * These two used to be the same value, and the empty case made that a bug
   * rather than a simplification: a token with no readable email produced three
   * empty required fields at signup, Turnkey refused it, and that person could
   * never create an account. A label is allowed to be a fallback. A required
   * field is not allowed to be blank.
   */
  label: string;
};

export function deriveLabel(idToken: string): Identity {
  let email = "";
  let sub = "";

  try {
    const claims = decodeClaims(idToken);
    if (typeof claims.email === "string") email = claims.email;
    if (typeof claims.sub === "string") sub = claims.sub;
  } catch {
    // A token this app cannot read is still a token Turnkey may accept, and it
    // is Turnkey's opinion that decides. Falling through with a made up label
    // keeps a display detail from refusing a valid sign in.
  }

  // `sub` is Google's stable identifier for the account, which is what Turnkey
  // matches on anyway, so it is the most honest fallback available.
  return { email, label: email || (sub ? `google:${sub}` : "cowl user") };
}
