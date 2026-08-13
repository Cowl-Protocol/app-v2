/**
 * Ask Turnkey the one question the offline tests cannot, run with
 * `npm run probe:turnkey`.
 *
 * **Is a Turnkey signature the same bytes every time?**
 *
 * The whole shielded account in this app is derived from the bytes of one
 * signature over one fixed message. That works because ECDSA can be made
 * deterministic, RFC 6979, and because every injected wallet is. Turnkey signs
 * inside an AWS Nitro enclave and **has never said which it does**. A search of
 * the complete published documentation, the whitepaper, the architecture blog
 * and the whole `tkhq/sdk` monorepo on 2026-08-08 returned no mention of RFC
 * 6979, of nonce generation, or of malleability.
 *
 * That silence is not neutral. Hedged signing, RFC 6979 plus fresh entropy, is a
 * normal choice for enclave signers precisely because pure determinism is more
 * exposed to fault attacks, and Turnkey's own docs confirm the enclave has an
 * entropy source in hand. Hedged signing is valid ECDSA, produces a different
 * signature every call, and would break this design silently: every session
 * would derive a different shielded account, the balance would read zero, and
 * the notes would sit in the pool addressed to keys nothing will derive again.
 *
 * `unlock.ts` signs twice on every unlock and refuses if the two differ, so a
 * user is never harmed by this. But a product whose sign in always refuses is
 * not a product, so **this has to be answered before anybody holds a balance**,
 * and it is cheaper to answer here than to discover at a login screen.
 *
 * Nothing here touches a chain, moves value, or costs gas. It signs a message
 * with a wallet in your own Turnkey organization and compares bytes.
 *
 *   TURNKEY_ORGANIZATION_ID=... \
 *   TURNKEY_API_PUBLIC_KEY=...  \
 *   TURNKEY_API_PRIVATE_KEY=... \
 *   npm run probe:turnkey
 *
 * The API keypair is the one from Dashboard · User · API keys. It is a parent
 * organization credential, so **run this from a laptop and never put it in the
 * app**, which is the entire reason the app talks to the auth proxy instead.
 */
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha2";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { SHIELDED_SIGN_MESSAGE } from "../src/features/keys";
import { __unlock } from "../src/features/auth/lib/unlock";
import { findProbeAccount } from "./probe-wallet.mjs";

const { eip191, assemble, address } = __unlock;

const API = "https://api.turnkey.com";

const ORG = required("TURNKEY_ORGANIZATION_ID");
const API_PUBLIC = required("TURNKEY_API_PUBLIC_KEY");
const API_PRIVATE = required("TURNKEY_API_PRIVATE_KEY");

/** How many signatures to compare. Two proves it; four makes a rare collision implausible. */
const ROUNDS = 4;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n${name} is not set. See the header of this file.\n`);
    process.exit(1);
  }
  return value;
}

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

/**
 * The same stamp the browser builds, with a raw private key instead of a
 * non-extractable one. noble emits DER directly, so the conversion the app has
 * to do by hand is not needed here.
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  const text = JSON.stringify(body);
  const signature = p256
    .sign(sha256(new TextEncoder().encode(text)), hexToBytes(API_PRIVATE.replace(/^0x/, "")))
    .toDERHex();

  const stamp = Buffer.from(
    JSON.stringify({
      publicKey: API_PUBLIC,
      scheme: "SIGNATURE_SCHEME_TK_API_P256",
      signature,
    }),
    "utf8",
  ).toString("base64url");

  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Stamp": stamp },
    body: text,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${JSON.stringify(json)}`);
  }
  return json as T;
}

type Activity = {
  activity: {
    id: string;
    status: string;
    failure?: { message?: string };
    result?: { signRawPayloadResult?: { r: string; s: string; v: string } };
  };
};

async function main() {
  console.log("\nFinding a wallet account to sign with");

  const account = await findProbeAccount({
    post,
    organizationId: ORG,
    walletName: process.env.TURNKEY_WALLET_NAME,
  });
  console.log(`  wallet ${account.walletName} · ${account.path} · ${account.address}`);

  const message = eip191(SHIELDED_SIGN_MESSAGE);
  const payloadHex = "0x" + bytesToHex(message);

  console.log(`\nSigning the unlock message ${ROUNDS} times`);
  const results: { r: string; s: string; v: string; id: string }[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const res = await post<Activity>("/public/v1/submit/sign_raw_payload", {
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      timestampMs: String(Date.now()),
      organizationId: ORG,
      parameters: {
        signWith: account.address,
        payload: payloadHex,
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_KECCAK256",
      },
    });

    if (res.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
      console.error(`\nActivity ${res.activity.status}: ${res.activity.failure?.message ?? ""}\n`);
      process.exit(1);
    }
    const r = res.activity.result?.signRawPayloadResult;
    if (!r) {
      console.error("\nCompleted with no signature in the result.\n");
      process.exit(1);
    }
    results.push({ ...r, id: res.activity.id });
    console.log(`  ${i} · r ${r.r.slice(0, 16)}… s ${r.s.slice(0, 16)}… v ${r.v}`);
  }

  console.log("\nThe question");

  // Distinct activity ids matter: identical ids would mean we compared one
  // signing operation with a cached copy of itself, which proves nothing.
  const ids = new Set(results.map((x) => x.id));
  check("each call was a separate signing activity", ids.size === ROUNDS,
    `${ids.size} distinct activity ids across ${ROUNDS} calls`);

  const assembled = results.map(assemble);
  const identical = assembled.every((x) => x === assembled[0]);
  check("every signature is byte identical", identical,
    identical ? undefined : `signatures differ, so the shielded account would change every session:\n          ${assembled.join("\n          ")}`);

  console.log("\nThe other three, which decide whether an exported key opens the same account");

  const first = results[0]!;
  const s = BigInt("0x" + first.s.replace(/^0x/, ""));
  check("s is on the low half of the curve", s <= secp256k1.CURVE.n / 2n,
    "a high s is still valid ECDSA, and would not match this key in an injected wallet");

  const rawV = first.v.replace(/^0x/, "");
  check("v is a recovery id of 00 or 01", rawV === "00" || rawV === "01",
    `v is ${first.v}, which is not the convention the adapters and the docs describe`);

  const sig = assembled[0]!;
  const recovered = address(
    secp256k1.Signature.fromCompact(hexToBytes(sig.slice(2, 130)))
      .addRecoveryBit(Number.parseInt(sig.slice(130), 16) - 27)
      .recoverPublicKey(keccak_256(message))
      .toRawBytes(false),
  );
  check("the assembled signature recovers the signing address", recovered === account.address.toLowerCase(),
    `recovered ${recovered}, wallet is ${account.address.toLowerCase()}`);

  if (failures === 0) {
    console.log(
      "\nAll checks passed. Signature derived keys are safe on this provider today.\n" +
        "\nStill open, and not answerable from here: whether these are the same bytes\n" +
        "viem would produce for the same private key. Determinism alone does not settle\n" +
        "it, because a deterministic nonce that is not RFC 6979 would be stable here and\n" +
        "still differ in an injected wallet. Settling it needs the private key on both\n" +
        "sides, so it belongs with the export flow, before export is offered.\n",
    );
  } else {
    console.log(`\n${failures} check(s) failed. Do not ship signature derived keys on this provider.\n`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
});
