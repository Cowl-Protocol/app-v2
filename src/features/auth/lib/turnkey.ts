/**
 * Turnkey, spoken to directly over `fetch`.
 *
 * There is an official SDK and this app deliberately does not use it. Three
 * reasons, in the order they matter.
 *
 * **It would persist the session.** `@turnkey/core` keeps the session keypair in
 * IndexedDB by default and its storage layer is not an optional part. See
 * `session-key.ts` for why a persisted session is a persisted route back to the
 * view key, which is the one secret in this product that cannot be rotated.
 *
 * **The dependency cost is out of proportion.** `@turnkey/react-wallet-kit`
 * arrives with a UI framework, an icon set, an animation player, a phone number
 * parser and a QR encoder, none of which this app would render, and `core` still
 * pulls ethers, viem and walletconnect. The whole surface used here is six HTTP
 * calls. The audit note in the workspace handoff is blunt about where the risk
 * in this project actually sits: the build machine turns dependencies into the
 * bundle in which a signature becomes a spending key, and that is the shortest
 * path from a bad package to somebody's money. This file adds **no** packages.
 *
 * **The wire format is small and worth being able to read.** Every request below
 * is a JSON body, signed by `stamp()`, posted to a documented path. What we send
 * Turnkey is visible in one file instead of four layers down a client object.
 *
 * The shapes here were taken from the shipped SDK source rather than from prose,
 * so they match what Turnkey's own clients send.
 */
import {
  TURNKEY_API_BASE_URL,
  TURNKEY_AUTH_PROXY_CONFIG_ID,
  TURNKEY_AUTH_PROXY_URL,
} from "@/config/auth";
import { SignInError } from "./errors";
import { decodeClaims } from "./jwt";
import { stamp } from "./session-key";

/**
 * The name this app gives the wallet it creates, and the name it looks the
 * wallet up by afterwards. Changing it strands every existing account behind a
 * lookup that no longer matches, so it is pinned here and used in both places.
 */
export const WALLET_NAME = "Cowl";

/**
 * The account that signs the shielded unlock message.
 *
 * Pinned in this repository rather than left to a default, because a build that
 * silently signed with a different path would derive a different shielded
 * account from the same Google login. Later accounts on the same keyring are the
 * receiving addresses handed out to payers.
 */
export const SIGNING_PATH = "m/44'/60'/0'/0/0";

/**
 * The receiving addresses, which are every account after the first.
 *
 * **Index 0 is the anchor and is never issued.** It signs the unlock message,
 * so it is the one address whose appearance on chain would tie a public
 * transfer to the account the shielded balance derives from. Everything handed
 * to a payer starts at 1.
 *
 * The keyring is the same one, so a funnel is recoverable from the same Google
 * login rather than being something that had to be written down.
 */
export function funnelPath(index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Funnel index must be a whole number from 1, got ${index}.`);
  }
  return `m/44'/60'/0'/0/${index}`;
}

/* ------------------------------------------------------------------------- *
 * the auth proxy: the two calls that need the parent organization's key
 * ------------------------------------------------------------------------- */

async function proxy<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(TURNKEY_AUTH_PROXY_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Proxy-Config-ID": TURNKEY_AUTH_PROXY_CONFIG_ID,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await turnkeyError(res, path, false);
  return (await res.json()) as T;
}

/**
 * Does a sub-organization already exist for this Google identity?
 *
 * Turnkey matches on the token's `iss`, `sub` and `aud` claims rather than on
 * the email, so a user who changes their Google address keeps their account and
 * a stranger who acquires that address does not inherit it.
 *
 * Returns an empty string when there is no account, which is the signal to sign
 * up rather than an error.
 */
export async function findSubOrg(oidcToken: string): Promise<string> {
  const res = await proxy<{ organizationId?: string }>("/v1/account", {
    filterType: "OIDC_TOKEN",
    filterValue: oidcToken,
  });
  return res.organizationId ?? "";
}

/**
 * Create the sub-organization, and the wallet inside it, in one activity.
 *
 * **The wallet is created here rather than left to a dashboard default**, so
 * both its name and its derivation path are recorded in this repository. The
 * name is what `listAccounts` finds it by afterwards, and the path is the
 * account that signs the shielded unlock message.
 *
 * `authenticators` and `apiKeys` are sent empty on purpose. Google is the only
 * credential this sub-organization has, so there is no long lived API key inside
 * it for anyone to steal, and the session key that arrives at login expires.
 *
 * `label` names the user and the organization. It is the Google email when there
 * is one and a stable identifier when there is not, because these fields are
 * required and an empty string would fail signup for that user permanently.
 */
export async function createSubOrg(params: {
  oidcToken: string;
  label: string;
}): Promise<string> {
  const res = await proxy<{ organizationId: string }>("/v1/signup_v2", {
    userName: params.label,
    /*
      **`userEmail` is deliberately not sent**, and leaving it out is what makes
      signup work at all with this configuration.

      It used to be sent whenever the Google token carried an email. Turnkey
      refuses that with `EMAIL OTP disallowed` when the auth proxy has One-Time
      Password turned off, because an address on the user is an email auth method
      in waiting and the config says there is no such method here. OTP is off on
      purpose: it is a second door into the same shielded account, and a weaker
      one than the Google account beside it. So the field goes rather than the
      setting.

      Nothing is lost. The address in the top bar comes from `deriveLabel`
      reading the token in this tab, never from Turnkey, and the product has no
      email to send. It is also one fewer piece of a user's identity held by a
      third party, which is the direction everything else here already points.
    */
    organizationName: params.label,
    authenticators: [],
    apiKeys: [],
    oauthProviders: [{ providerName: "Google", oidcToken: params.oidcToken }],
    wallet: {
      walletName: WALLET_NAME,
      accounts: [
        {
          curve: "CURVE_SECP256K1",
          pathFormat: "PATH_FORMAT_BIP32",
          path: SIGNING_PATH,
          addressFormat: "ADDRESS_FORMAT_ETHEREUM",
        },
      ],
    },
  });
  return res.organizationId;
}

/**
 * Exchange the Google token for a session.
 *
 * The token can only be spent once and only by whoever holds the session private
 * key, because Turnkey re-verifies inside its enclave that the token's `nonce`
 * claim is `sha256` of the public key sent here. A token intercepted in transit
 * is worthless without the key that never left the browser.
 */
export async function oauthLogin(params: {
  oidcToken: string;
  publicKey: string;
}): Promise<string> {
  const res = await proxy<{ session?: string }>("/v1/oauth_login", {
    oidcToken: params.oidcToken,
    publicKey: params.publicKey,
    invalidateExisting: false,
  });
  if (!res.session) throw new Error("Turnkey returned no session.");
  return res.session;
}

/* ------------------------------------------------------------------------- *
 * the signed API: everything the session key can do for itself
 * ------------------------------------------------------------------------- */

async function signed<T>(path: string, body: unknown): Promise<T> {
  // Stringify once. The stamp signs these exact bytes, so anything that
  // re-serialises the body between here and `fetch` invalidates it.
  const text = JSON.stringify(body);
  const s = await stamp(text);
  const res = await fetch(TURNKEY_API_BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", [s.name]: s.value },
    body: text,
  });
  if (!res.ok) throw await turnkeyError(res, path, true);
  return (await res.json()) as T;
}

/**
 * The claims inside a session JWT.
 *
 * Read, never trusted for authorisation. Turnkey checks the stamp on every
 * request, so nothing here decides what this client may do; it decides what this
 * client should ask for. Reading it without verifying its signature is therefore
 * correct rather than a shortcut, and it is also all this app could do, since
 * verifying it would need Turnkey's public key and buy nothing.
 */
export type Session = {
  organizationId: string;
  userId: string;
  publicKey: string;
  /** Seconds since the epoch, Turnkey's own clock. */
  expiry: number;
};

export function readSession(jwt: string): Session {
  const claims = decodeClaims(jwt) as {
    exp?: number;
    public_key?: string;
    user_id?: string;
    organization_id?: string;
  };

  if (!claims.exp || !claims.public_key || !claims.user_id || !claims.organization_id) {
    throw new Error("Session token is missing claims.");
  }

  return {
    organizationId: claims.organization_id,
    userId: claims.user_id,
    publicKey: claims.public_key,
    expiry: claims.exp,
  };
}

export type WalletAccount = {
  address: string;
  path: string;
};

export type Wallet = {
  /** Needed to add an account later, which is how a funnel gets issued. */
  walletId: string;
  accounts: WalletAccount[];
};

/**
 * The accounts on **this app's** wallet.
 *
 * The wallet is chosen by name, not by position. That distinction is the whole
 * function. Taking `wallets[0]` reads fine and is wrong in a way nothing
 * downstream can catch: `m/44'/60'/0'/0/0` exists on every Ethereum wallet, so a
 * second wallet in the sub-organization yields an account at the expected path
 * whose address is a different one, the unlock signature then recovers to that
 * address and passes every check in `unlock.ts`, and a valid, empty shielded
 * account is derived. Turnkey does not document the order `list_wallets`
 * returns, and a second wallet arrives the moment a sub-organization is
 * provisioned anywhere but here, which `signUp` is deliberately skipped for on
 * every returning user.
 *
 * So an ambiguous answer is refused rather than guessed at. Being unable to sign
 * in is a bad afternoon; deriving the wrong account is unrecoverable and looks
 * exactly like theft.
 */
export async function openWallet(session: Session): Promise<Wallet> {
  const { wallets } = await signed<{ wallets: { walletId: string; walletName: string }[] }>(
    "/public/v1/query/list_wallets",
    { organizationId: session.organizationId },
  );

  if (wallets.length === 0) {
    throw new SignInError(
      "This account has no wallet yet. Please try signing in again.",
      "sub-organization has no wallets",
    );
  }

  // Named match first. Falling back to a lone unnamed wallet keeps any account
  // created before this app pinned the name working, and the fallback is only
  // reachable when there is exactly one candidate, so it cannot pick.
  const named = wallets.filter((w) => w.walletName === WALLET_NAME);
  const candidates = named.length > 0 ? named : wallets;

  if (candidates.length !== 1) {
    throw new SignInError(
      "This account has more than one wallet, so it cannot be opened safely. " +
        "Nothing was changed.",
      `expected one wallet named ${WALLET_NAME}, found ${candidates.length} candidates of ` +
        `${wallets.length} wallets: ${wallets.map((w) => w.walletName).join(", ")}`,
    );
  }

  const accounts = await signed<{
    accounts: { address: string; path: string }[];
  }>("/public/v1/query/list_wallet_accounts", {
    organizationId: session.organizationId,
    walletId: candidates[0]!.walletId,
  });

  return {
    walletId: candidates[0]!.walletId,
    accounts: accounts.accounts.map((a) => ({ address: a.address, path: a.path })),
  };
}

/**
 * Add one account to this wallet and return the address it derived.
 *
 * **This is how a funnel comes into existence**, and it is the only write to the
 * wallet this app makes after signup. The path is passed in rather than counted
 * here, because which index is next is a question about the accounts that
 * already exist and that answer belongs beside them.
 *
 * Turnkey derives it inside the enclave from the same seed as the signing
 * account, so the address is recoverable from the same Google login and nothing
 * about it has to be stored here. The activity is idempotent in the way that
 * matters: asking for a path that already exists returns its address rather than
 * a second account.
 */
export async function createWalletAccount(params: {
  session: Session;
  walletId: string;
  path: string;
}): Promise<string> {
  const res = await signed<ActivityResponse>("/public/v1/submit/create_wallet_accounts", {
    type: "ACTIVITY_TYPE_CREATE_WALLET_ACCOUNTS",
    timestampMs: String(Date.now()),
    organizationId: params.session.organizationId,
    parameters: {
      walletId: params.walletId,
      accounts: [
        {
          curve: "CURVE_SECP256K1",
          pathFormat: "PATH_FORMAT_BIP32",
          path: params.path,
          addressFormat: "ADDRESS_FORMAT_ETHEREUM",
        },
      ],
    },
  });

  const done = await settle(res, params.session);
  const address = done.activity.result?.createWalletAccountsResult?.addresses?.[0];
  if (!address) {
    throw new Error("Turnkey created the account but returned no address for it.");
  }
  return address;
}

/**
 * Sign a payload with one of the sub-organization's accounts.
 *
 * `payload` is hex of the bytes to be hashed, and Turnkey applies keccak inside
 * the enclave, which is what `HASH_FUNCTION_KECCAK256` means. That is the same
 * split an injected wallet makes: the caller supplies the prefixed message, the
 * signer hashes it. Building the digest here and asking for `NO_OP` would work
 * equally well and put one more thing between us and a signature that has to
 * match another client's byte for byte.
 *
 * Returns `r`, `s` and `v` as Turnkey gives them, unjoined. `unlock.ts` decides
 * what a 65 byte Ethereum signature looks like, because that is where the answer
 * has to agree with the dapp.
 */
export async function signRawPayload(params: {
  session: Session;
  signWith: string;
  payloadHex: string;
}): Promise<{ r: string; s: string; v: string }> {
  const res = await signed<ActivityResponse>("/public/v1/submit/sign_raw_payload", {
    type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
    timestampMs: String(Date.now()),
    organizationId: params.session.organizationId,
    parameters: {
      signWith: params.signWith,
      payload: params.payloadHex,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: "HASH_FUNCTION_KECCAK256",
    },
  });

  const done = await settle(res, params.session);
  const result = done.activity.result?.signRawPayloadResult;
  if (!result) throw new Error("Turnkey completed the signature with no result.");
  return result;
}

/* ------------------------------------------------------------------------- *
 * activities
 * ------------------------------------------------------------------------- */

type ActivityResponse = {
  activity: {
    id: string;
    status: string;
    failure?: { message?: string };
    result?: {
      signRawPayloadResult?: { r: string; s: string; v: string };
      createWalletAccountsResult?: { addresses?: string[] };
    };
  };
};

const TERMINAL = ["ACTIVITY_STATUS_COMPLETED", "ACTIVITY_STATUS_FAILED", "ACTIVITY_STATUS_REJECTED"];

/**
 * Wait for an activity to reach a terminal state, then insist it succeeded.
 *
 * A sub-organization with one credential and no policies completes signing
 * synchronously, so the loop below normally does not run at all. It exists
 * because the alternative to polling is reading `result` off an activity that is
 * still pending, which is `undefined`, and an `undefined` signature would
 * surface as a derivation failure a long way from its cause.
 */
async function settle(res: ActivityResponse, session: Session): Promise<ActivityResponse> {
  let current = res;
  for (let attempt = 0; attempt < 4 && !TERMINAL.includes(current.activity.status); attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    current = await signed<ActivityResponse>("/public/v1/query/get_activity", {
      organizationId: session.organizationId,
      activityId: current.activity.id,
    });
  }

  if (current.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
    throw new Error(
      current.activity.failure?.message ?? `Turnkey activity ${current.activity.status}.`,
    );
  }
  return current;
}

/**
 * Turn a failed response into an error worth reading.
 *
 * The path is included because every call in this file posts JSON and gets JSON
 * back, so without it a 403 from the proxy and a 403 from the API are the same
 * sentence. The response body is not logged anywhere: on the login path it can
 * contain the identity token, which is a bearer credential for the account.
 */
async function turnkeyError(
  res: Response,
  path: string,
  /** Whether the call carried a session stamp, which decides what a 401 means. */
  stamped: boolean,
): Promise<Error> {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) detail = body.message;
  } catch {
    // A non-JSON body is a gateway or a network appliance talking, not Turnkey.
  }

  // The session is short lived and this app cannot renew one, because renewing
  // needs the key that dies with the tab. A tab left open past the expiry gets
  // 401 on every stamped call, and "please try again" would be advice that
  // cannot work. Saying which action helps is the difference.
  //
  // **Only for stamped calls.** The auth proxy runs before a session exists, so
  // a 401 or 403 there is a rejected token or a misconfigured project, never an
  // expiry. Telling a first time visitor that their session expired sends them
  // to press the button again forever, and it hid a real one: `EMAIL OTP
  // disallowed` from signup read on screen as an expired session, which is the
  // one thing it could not have been. An unrecognised failure falls through to
  // the generic line, which at least does not name a cause that is wrong.
  if (stamped && (res.status === 401 || res.status === 403)) {
    return new SignInError(
      "Your session has expired. Please sign in again.",
      `Turnkey ${path}: ${detail}`,
    );
  }

  // The organization ran out of signing quota, which is this deployment's
  // problem and not this visitor's. Seen for real on 2026-08-14: every sign in
  // stopped at the unlock signature with `Resource exhausted`, and the generic
  // line sent people to press the button again, which is the one thing that
  // could not work · exactly the failure the 401 case above exists to avoid.
  //
  // **Turnkey's own wording never reaches the screen.** It names a paid plan and
  // a support address, which is advice for whoever runs this app and reads to a
  // user as their money being behind a billing problem. The detail stays in
  // `reason`, where the console has it and the operator can act on it.
  //
  // Matched on the message as well as the status, because a quota refusal is a
  // gRPC `RESOURCE_EXHAUSTED` and which HTTP status that surfaces as is
  // Turnkey's to change.
  if (res.status === 429 || /resource exhausted|allotted quota|over its quota/i.test(detail)) {
    return new SignInError(
      "This app cannot sign right now, so your account could not be opened. " +
        "Nothing was changed · try again later.",
      `Turnkey ${path}: ${detail}`,
    );
  }

  return new Error(`Turnkey ${path}: ${detail}`);
}
