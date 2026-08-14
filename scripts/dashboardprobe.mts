/**
 * What the provider's dashboard is actually set to, asserted rather than
 * remembered.
 *
 * **The dashboard is part of this app's security surface and it lives in no
 * repository.** Which login methods are open, which origins may use this app id
 * and whether a wallet is created at login are all decided in somebody else's
 * web UI, and nothing in this codebase could see any of it. A method switched on
 * there and omitted from `loginMethods` in the client is still reachable · the
 * client decides which button is drawn, the dashboard decides what the provider
 * will accept.
 *
 * **It needs no secret.** The app id is a public identifier that ships in the
 * bundle, and the provider serves this configuration to anyone holding it, which
 * is the same read the SDK performs on every page load. So this probe can run on
 * any laptop, in CI, and before every deploy · unlike `probe:privy`, which needs
 * an app secret and therefore runs almost never.
 *
 *   npm run probe:dashboard
 *
 * Reads `.env.local` for `NEXT_PUBLIC_PRIVY_APP_ID`, or takes `PRIVY_APP_ID`
 * from the shell.
 */
import { readFileSync } from "node:fs";

const CONFIG_URL = "https://auth.privy.io/api/v1/apps";

/**
 * The one method that may be on.
 *
 * Every additional door reaches the same shielded account, and the weakest one
 * sets the strength of all of them: the account derives from a signature by a
 * key this provider holds, so anything that can authenticate as the user derives
 * the view key, which reads payment history backwards and cannot be rotated.
 */
const ALLOWED_METHOD = "google_oauth";

function appId(): string {
  const fromShell = process.env.PRIVY_APP_ID;
  if (fromShell) return fromShell;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("NEXT_PUBLIC_PRIVY_APP_ID="));
    const value = line?.slice("NEXT_PUBLIC_PRIVY_APP_ID=".length).trim();
    if (value) return value;
  } catch {
    /* falls through to the message below */
  }
  console.error(
    "\nNo app id. Set PRIVY_APP_ID in the shell, or NEXT_PUBLIC_PRIVY_APP_ID in .env.local.\n",
  );
  process.exit(1);
}

let checks = 0;
let failures = 0;
let warnings = 0;

function check(name: string, ok: boolean, detail?: string) {
  checks++;
  if (ok) {
    console.log(`  ok    ${name}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
}

function warn(name: string, detail: string) {
  warnings++;
  console.log(`  warn  ${name}\n        ${detail}`);
}

type AppConfig = Record<string, unknown> & {
  name?: string;
  allowed_domains?: string[];
  custom_oauth_providers?: unknown[];
  embedded_wallet_config?: {
    ethereum?: { create_on_login?: string };
    mode?: string;
  };
};

const id = appId();
const res = await fetch(`${CONFIG_URL}/${id}`, {
  headers: { "privy-app-id": id },
});

if (!res.ok) {
  console.error(`\nThe provider refused to describe this app · HTTP ${res.status}.\n`);
  process.exit(2);
}

const app = (await res.json()) as AppConfig;

console.log(`\nProvider dashboard · app "${app.name ?? "unnamed"}" · ${id}`);

console.log("\nLogin methods · one door, and it is Google\n");

check("Google is on, or nobody can sign in at all", app[ALLOWED_METHOD] === true);

{
  /*
    Enumerating the methods we know about would go quietly stale the first time
    the provider adds one. Every flag whose name ends in `_auth` or `_oauth` is a
    way in by construction, so the rule is over the shape of the key rather than
    over a list somebody has to remember to extend.
  */
  const doors = Object.keys(app)
    .filter((k) => /_(auth|oauth)$/.test(k))
    .filter((k) => k !== ALLOWED_METHOD)
    .filter((k) => app[k] === true);

  check(
    "every other login method is off",
    doors.length === 0,
    doors.length
      ? `open: ${doors.join(", ")} · each one is a second and weaker door into the same shielded account`
      : undefined,
  );
}

{
  /* Signup flags are doors too, and they do not end in `_auth`. */
  const signup = ["external_wallets_for_signup_enabled", "passkeys_for_signup_enabled"]
    .filter((k) => app[k] === true);

  check(
    "no second way to create an account",
    signup.length === 0,
    signup.length ? `open: ${signup.join(", ")}` : undefined,
  );
}

check(
  "no custom OAuth provider is registered",
  (app.custom_oauth_providers ?? []).length === 0,
);

console.log("\nOrigins · who may use this app id\n");

{
  /*
    The one that decides whether any of the above matters. An origin that can use
    this app id can run this app's own sign in, reach the same provider account,
    and ask it to sign · and because confirmation UIs are deliberately off so
    unlocking does not show two dialogs, that signature comes back without the
    person seeing anything. The unlock signature is the entire shielded account
    and cannot be rotated. So the allowlist is not hardening around the edges, it
    is the control that keeps the previous section true.
  */
  const domains = app.allowed_domains ?? [];
  if (domains.length === 0) {
    warn(
      "no origin allowlist is set",
      "any origin holding this app id can run this sign in and obtain the unlock signature\n" +
        "        silently, because confirmation UIs are off · that signature is the whole shielded\n" +
        "        account and cannot be rotated. Fine while this only runs on a laptop. Name the\n" +
        "        exact origins in the dashboard before it is served from anywhere public.",
    );
  } else {
    console.log(`  ok    origins are pinned · ${domains.join(", ")}`);
    checks++;
  }
}

console.log("\nEmbedded wallet · the account has to exist before it can be opened\n");

{
  const onLogin = app.embedded_wallet_config?.ethereum?.create_on_login ?? "off";
  if (onLogin === "off") {
    warn(
      `the dashboard creates no wallet at login · create_on_login is "${onLogin}"`,
      "the client config sets `users-without-wallets` and wins, because the SDK resolves this as\n" +
        "        client ?? dashboard · so sign in still works and this is not an outage. It is worth\n" +
        "        fixing anyway: anyone auditing the dashboard reads the opposite of what the app does,\n" +
        "        and the app is then relying on an override rather than on the setting.",
    );
  } else {
    console.log(`  ok    a wallet is created at login · "${onLogin}"`);
    checks++;
  }
}

{
  /*
    Session signers are how a backend signs while the user is away, and taking
    them is the line that turns this into the custodial product it is not. The
    mode below permits them; the client never asks for any, and that is the
    property worth restating where somebody configuring the dashboard will read
    it.
  */
  const mode = app.embedded_wallet_config?.mode ?? "unknown";
  console.log(`  note  wallet mode is "${mode}" · this app grants no session signer and must not`);
}

console.log(
  failures === 0
    ? `\n${checks} checks pass${warnings ? `, ${warnings} to settle before this is served publicly` : ""}.\n`
    : `\n${failures} of ${checks} dashboard checks FAILED · the client cannot fix any of them.\n`,
);
process.exit(failures === 0 ? 0 : 1);
