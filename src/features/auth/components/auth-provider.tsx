"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import {
  AUTH_CONFIGURED,
  OAUTH_REDIRECT_URL,
  PRIVY_APP_ID,
  PRIVY_CLIENT_ID,
} from "@/config";

/**
 * The wallet provider's React context, configured in one place.
 *
 * **This and `lib/providers/privy.ts` are the only two files that name the
 * vendor.** Everything else in the app talks to a `ShieldedSigner` or to
 * `useSignIn`, which is what makes the next swap a rewrite of two files rather
 * than of the code that derives keys.
 *
 * The configuration below is mostly a list of things being turned **off**, and
 * each one closes a door this product does not want open.
 */

/**
 * An unconfigured build still has to render.
 *
 * The provider throws on an empty app id, which would take the whole page down
 * rather than the button. Every screen behind the door is reachable with
 * `SKIP_LOGIN` and none of that work needs an account, so a missing id degrades
 * to a login card that says it has no credentials · which is what
 * `AUTH_CONFIGURED` already drives.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!AUTH_CONFIGURED) return <>{children}</>;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      config={{
        /*
          Google, and nothing else. Every additional method is another door into
          the same shielded account and the weakest one sets the strength of all
          of them: the account derives from a signature by a key this provider
          holds, so anything that can authenticate as the user can derive the
          view key, which reads payment history backwards and cannot be rotated.
          Email OTP in particular is a second and weaker door beside the Google
          account, which is why it was off in the previous provider's dashboard
          too. **This list must also be matched in the dashboard**, since a
          method enabled there and omitted here is still reachable.
        */
        loginMethods: ["google"],

        /*
          No injected wallets. This app's whole shape is that a user needed no
          wallet to arrive, and an extension appearing in `useWallets()` is one
          more candidate for the selection in `lib/providers/privy.ts` to have to
          refuse. Turning them off entirely is cheaper than filtering them.
        */
        externalWallets: { disableAllExternalWallets: true },

        embeddedWallets: {
          ethereum: {
            /*
              The keyring exists from the first login, so the anchor at HD index
              0 is there before anything asks it to sign. `sign-in.ts` still
              creates it when it is missing, and the two are not redundant: this
              is the intent, that is the recovery when a creation did not happen
              or a wallet was provisioned outside this app.
            */
            createOnLogin: "users-without-wallets",
          },

          /*
            **No confirmation modals, and this is load bearing rather than
            cosmetic.** Unlocking signs the same message twice on purpose, so
            leaving the default on would ask a person to approve two dialogs
            they have no way to evaluate, for an operation they already asked
            for by signing in. Every call site passes this too, because a
            provider default is a thing that can change under a release.
          */
          showWalletUIs: false,
        },

        /*
          Only set when a build is served from a host it cannot read off
          `window.location`. Undefined leaves the SDK returning to the page that
          started the flow, which is right everywhere else.
        */
        ...(OAUTH_REDIRECT_URL ? { customOAuthRedirectUrl: OAUTH_REDIRECT_URL } : {}),
      }}
    >
      {children}
    </PrivyProvider>
  );
}
