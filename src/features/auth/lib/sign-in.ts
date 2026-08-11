/**
 * Sign in, end to end, as one function.
 *
 * The order below is the whole design, and every step is here rather than spread
 * across a provider so that what this app hands to whom can be read in one
 * screen. Nothing is written to disk at any point.
 *
 *   1. A P-256 keypair is generated in this tab. The private half is
 *      non-extractable and never leaves WebCrypto.
 *   2. Google is asked for an identity token whose `nonce` commits to that
 *      public key. The token comes back through a popup, in a fragment, so it
 *      never appears in a request line.
 *   3. Turnkey's auth proxy is asked whether this Google identity already has a
 *      sub-organization, and creates one with a wallet if not.
 *   4. The token is exchanged for a session bound to the keypair from step 1.
 *   5. The wallet's first account signs the shielded unlock message, and the
 *      shielded keys are derived from those bytes in this tab.
 *
 * **What the network sees.** Google learns that someone signed into our client
 * id, which is what signing in with Google means. Turnkey learns the identity
 * and holds the Ethereum key. Neither learns the shielded keys, which are
 * derived in step 5 from a signature that is never sent anywhere, and no server
 * of ours is in the path at all.
 */
import { SignInError } from "./errors";
import { deriveLabel } from "./identity";
import { completeGoogleSignIn, openSignInWindow } from "./google";
import { clearSessionKey, createSessionKey } from "./session-key";
import {
  createSubOrg,
  findSubOrg,
  listAccounts,
  oauthLogin,
  readSession,
  SIGNING_PATH,
  type Session,
} from "./turnkey";
import { unlockShieldedAccount } from "./unlock";
import type { ShieldedKeys } from "@/features/keys";

export type Account = {
  session: Session;
  /** The Ethereum address the shielded account derives from. Never shown, never published. */
  address: string;
  keys: ShieldedKeys;
  /** Only for the account control in the top bar. The address and the email stay off screen. */
  email: string;
};

export async function signIn(): Promise<Account> {
  // **First statement, and nothing may be awaited before it.** A browser only
  // permits `window.open` while it still counts as inside the click that caused
  // it, and every `await` above this line spends that. Chrome keeps the
  // activation alive long enough to hide the mistake. Safari blocks the popup.
  //
  // This works from an async click handler because the body of an async
  // function runs synchronously up to its own first await, so `signIn()` is
  // still inside the handler's call stack when this line executes.
  const popup = openSignInWindow();

  try {
    const publicKey = await createSessionKey();
    const idToken = await completeGoogleSignIn(popup, publicKey);
    const { email, label } = deriveLabel(idToken);

    // Look up first, create only if absent. Signing up an existing user would
    // be refused by Turnkey anyway, but the refusal reads as a failure rather
    // than as a returning user, which is what most sign ins are.
    if (!(await findSubOrg(idToken))) {
      await createSubOrg({ oidcToken: idToken, label });
    }

    const session = readSession(await oauthLogin({ oidcToken: idToken, publicKey }));

    const accounts = await listAccounts(session);
    const signing = accounts.find((a) => a.path === SIGNING_PATH);
    if (!signing) {
      // Reachable only if a wallet was created outside this code, which today
      // means a dashboard default. Guessing at another account here would derive
      // a shielded account that the next release would not find again.
      throw new SignInError(
        "This account's wallet is not in the shape this app expects, so it cannot " +
          "be opened safely. Nothing was changed.",
        `wallet has no account at ${SIGNING_PATH}, found ${accounts.map((a) => a.path).join(", ")}`,
      );
    }

    const keys = await unlockShieldedAccount({ session, signWith: signing.address });
    return { session, address: signing.address, keys, email };
  } catch (err) {
    // Closing an already closed window is a no-op, so this is a safety net for
    // the paths that do not reach the popup at all rather than a duplicate.
    popup.close();

    // A half finished sign in leaves a usable session key behind, and the next
    // attempt generates its own. Dropping it here keeps the only rule this app
    // has about secrets: they exist while they are being used and not after.
    clearSessionKey();
    throw err;
  }
}

/**
 * Forget the Turnkey session key.
 *
 * **Half of signing out, and not the half that matters most.** This makes the
 * Turnkey session unusable, because a session is only its key here. It does
 * nothing about the shielded keys, which live in the gate's state and are handed
 * to the app through context, so on its own this leaves `viewPriv` readable by
 * any script on the page for the life of the tab while the user believes they
 * have signed out.
 *
 * That is why it is **not exported from `index.ts`**. `AuthGate` owns the
 * account object, so `AuthGate` owns signing out: it calls this and drops the
 * state in the same act, and `useSignOut` is what the rest of the app gets.
 * There is nothing persisted to clear, which is the point.
 */
export function forgetSession(): void {
  clearSessionKey();
}
