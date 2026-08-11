/**
 * Shapes shared across the app. No behaviour, no imports, so anything may use
 * them without picking up a dependency.
 */

/**
 * Who is signed in, as far as the interface is concerned.
 *
 * **There is no avatar url and that is on purpose.** Every provider hands one
 * out and every app renders it, which means a request to `googleusercontent.com`
 * on each page view carrying that account's own image path. In an app built so
 * that nothing on our side can log a session, fetching the user's face from
 * somebody else's server on every visit is a beacon we would be installing
 * ourselves. Initials cost one letter of fidelity and no requests.
 *
 * The email is not here either. It is the thing the account is, not the thing
 * the person is called, and putting it in the top bar of a balance screen means
 * it appears in every screenshot and over every shoulder for no benefit. It
 * belongs in the account menu, next to signing out.
 */
export type Profile = {
  /** From the auth provider, or the local part of the email when it gives none. */
  name: string;
};
