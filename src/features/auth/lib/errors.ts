/**
 * The two halves of a failed sign in: what the user reads, and what we need.
 *
 * Sign in touches Google, Turnkey, WebCrypto and a curve library, and each of
 * them fails in its own vocabulary. Some of those messages carry a path, a
 * status code, or, on this particular flow, a fragment of an identity token,
 * which is a bearer credential for the account. So the rule is that **only a
 * message this feature wrote is ever rendered**, and everything else becomes one
 * generic line.
 *
 * This used to be decided by matching on the start of the string, which is how
 * three real failures ended up with copy that could never reach a screen: the
 * wallet shape error, Google's own error codes, and a missing session all failed
 * the match and were replaced by the generic line. A type cannot drift like
 * that. Throwing `SignInError` **is** the statement that a human wrote this.
 *
 * `reason` is the accurate half. It is written to the console and never
 * rendered, because the sentence that reassures somebody at a login screen and
 * the sentence that identifies the bug are almost never the same sentence.
 */
/**
 * The mark that says "this feature wrote this message".
 *
 * A property rather than `instanceof`, and the reason is not theoretical. Under
 * the test runner this module is instantiated twice, so `err instanceof
 * SignInError` was **false for errors this file had just constructed**, with a
 * correct prototype chain and a matching `constructor.name`. Two copies of a
 * class are two classes.
 *
 * A bundler that split this module across chunks would do the same thing in the
 * browser, and the symptom there is not a failing test: it is every refusal
 * silently degrading to the generic line, including the ones that exist to
 * report that key derivation is not reproducible. A field survives all of it.
 */
const MARK = "__cowlSignInError";

export class SignInError extends Error {
  readonly reason: string;
  /** See `MARK`. Read by `isSignInError`, never by anything else. */
  readonly [MARK] = true;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = "SignInError";
    this.reason = reason ?? message;
  }
}

/** True for an error this feature wrote a human readable message for. */
export function isSignInError(err: unknown): err is SignInError {
  return err instanceof Error && (err as Partial<SignInError>)[MARK] === true;
}

/**
 * A refusal from the key derivation step specifically.
 *
 * Separate from its parent because these are the failures that would otherwise
 * hand somebody a valid, empty shielded account, and a stack trace that says
 * which kind of failure it was is worth having when the answer arrives from the
 * field rather than from a test.
 */
const UNLOCK_MARK = "__cowlUnlockError";

export class UnlockError extends SignInError {
  readonly [UNLOCK_MARK] = true;

  constructor(message: string, reason: string) {
    super(message, reason);
    this.name = "UnlockError";
  }
}

/** True for a refusal from the key derivation step specifically. */
export function isUnlockError(err: unknown): err is UnlockError {
  return err instanceof Error && (err as Partial<UnlockError>)[UNLOCK_MARK] === true;
}

/**
 * Say out loud why sign in stopped, without saying it on screen.
 *
 * The only `console` call in `src/`, and it earns the exception. README records
 * that whether Turnkey signs deterministically is unanswered; if that answer
 * turns out badly in production, this line is the difference between a report
 * that names the cause and a user saying sign in does not work.
 *
 * Nothing secret passes through here. The reasons name an address, a status, or
 * a curve property, never a key, a signature or a token.
 */
export function reportSignInFailure(err: unknown): void {
  if (isSignInError(err)) {
    console.warn(`[cowl] sign in stopped: ${err.reason}`);
    return;
  }
  console.warn("[cowl] sign in stopped:", err);
}
