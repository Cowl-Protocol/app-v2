/**
 * Export a Turnkey wallet account and ask the two questions that decide whether
 * a recovery key is possible at all. Run with `npm run probe:export`.
 *
 * **This one takes a private key out of the enclave.** Nothing else in this
 * repository does. The wallet it is pointed at must be a throwaway, and it must
 * be deleted afterwards, because a key that has been in a process on a laptop is
 * a key that lives on that laptop's swap, its crash dumps and its backups
 * forever. The script says so again at the end, where it is harder to skip.
 *
 * **Question one: can a key come back out at all, and does it arrive intact?**
 * `docs` and the SDK both describe export as a session-authenticated call, but
 * neither says what the policy engine does when it is actually asked. The whole
 * export and recovery plan for app-v2 rests on the answer, and the plan is
 * cheaper to abandon now than after a screen is built on it.
 *
 * **Question two: are Turnkey's signature bytes the bytes viem would produce?**
 * `probe:turnkey` proved the enclave signs deterministically, which is a
 * different claim. A deterministic nonce that is not RFC 6979 would be stable
 * across sessions and still differ from every injected wallet, which would mean
 * this app and the dapp are *not* one shielded account space and an exported key
 * opens a different balance than the one its owner was looking at. Settling it
 * needs the private key on both sides, which is exactly what this script has and
 * nothing else can get.
 *
 *   TURNKEY_ORGANIZATION_ID=... \
 *   TURNKEY_API_PUBLIC_KEY=...  \
 *   TURNKEY_API_PRIVATE_KEY=... \
 *   npm run probe:export
 *
 * **What this deliberately does not answer.** It stamps with a parent
 * organization API key against a wallet in that same organization, because that
 * is the only credential a script can hold. A sub-organization root user
 * exporting from its own sub-organization is the same relationship and a
 * different policy path, so a pass here is strong evidence and not proof. The
 * conclusive run is the app's own login reaching this endpoint, and it belongs
 * with the screen that will call it.
 *
 * **The private key is never printed.** Not a prefix, not a length-truncated
 * form. What gets printed is the address it derives to, which is public, and the
 * answers to the two questions above.
 */
import { gcm } from "@noble/ciphers/aes";
import { p256 } from "@noble/curves/p256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { expand, extract } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { deriveFromSignature, SHIELDED_SIGN_MESSAGE } from "../src/features/keys";
import { __unlock } from "../src/features/auth/lib/unlock";
import { findProbeAccount } from "./probe-wallet.mjs";

const { eip191, assemble, address } = __unlock;

const API = "https://api.turnkey.com";

/**
 * Read when the run starts rather than when the file loads.
 *
 * The HPKE port below is exported so it can be tested against Turnkey's own
 * implementation without a network or a credential, and a module that exits on
 * import cannot be tested at all.
 */
let ORG = "";
let API_PUBLIC = "";
let API_PRIVATE = "";

/**
 * The signing enclave's public key, copied from `@turnkey/crypto`'s
 * `PRODUCTION_SIGNER_SIGN_PUBLIC_KEY`.
 *
 * **This constant is the whole of the trust here.** The export bundle arrives
 * over TLS from an endpoint that also chose what to put in it, so the only thing
 * separating a real key from a substituted one is that the bundle carries a
 * signature this key verifies. Turnkey's own SDK names the parameter that
 * overrides it `dangerouslyOverrideSignerPublicKey`, which is the right amount
 * of warning.
 */
const SIGNER_PUBLIC_KEY =
  "04cf288fe433cc4e1aa0ce1632feac4ea26bf2f5a09dcfe5a42c398e06898710330f0572882f4dbdf0f5304b8fc8703acd69adca9a4bbf7f5d00d20a5e364b2569";

/**
 * `r` from the first four signatures, 2026-08-12, and again on 08-13.
 *
 * A tripwire rather than a test of this run. If the enclave ever changes how it
 * derives its nonce, every check in `probe:turnkey` still passes, four
 * signatures in one session would agree with each other, and this constant is
 * the only thing in the repository that would notice.
 */
const FROZEN_R = "ccf27978e99d7a64";

let failures = 0;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n${name} is not set. See the header of this file.\n`);
    process.exit(1);
  }
  return value;
}

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

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

/* ------------------------------------------------------------------------- *
 * HPKE, ported rather than depended on
 * ------------------------------------------------------------------------- *
 *
 * `@turnkey/crypto` does this, and taking it would add five packages to the
 * bundle that turns a signature into a spending key. The three it needs that are
 * not already here are a certificate parser, a Borsh codec and a CBOR codec,
 * none of which this path touches. Everything below runs on the `@noble` trio
 * this app already ships.
 *
 * The scheme is HPKE base mode, DHKEM(P-256, HKDF-SHA256), HKDF-SHA256,
 * AES-256-GCM, which is RFC 9180's suite `0x0010 / 0x0001 / 0x0002`. The
 * constants are Turnkey's own, byte for byte, because the point of this file is
 * to interoperate with their enclave rather than to agree with itself.
 */

const HPKE_VERSION = utf8ToBytes("HPKE-v1");
/** `KEM` || 0x0010, the DHKEM(P-256, HKDF-SHA256) suite id. */
const SUITE_ID_KEM = concatBytes(utf8ToBytes("KEM"), new Uint8Array([0, 16]));
/** `HPKE` || kem 0x0010 || kdf 0x0001 || aead 0x0002. */
const SUITE_ID_HPKE = concatBytes(
  utf8ToBytes("HPKE"),
  new Uint8Array([0, 16, 0, 1, 0, 2]),
);

/** `labeled_ikm` from RFC 9180 §4: version || suite || label || ikm. */
function labeledIkm(label: string, ikm: Uint8Array, suiteId: Uint8Array): Uint8Array {
  return concatBytes(HPKE_VERSION, suiteId, utf8ToBytes(label), ikm);
}

/**
 * `labeled_info` from RFC 9180 §4, with the two byte output length in front.
 *
 * The leading `[0, len]` is the length as a big-endian `uint16`, which is why
 * nothing here works for an output longer than 255 bytes and why nothing here
 * asks for one.
 */
function labeledInfo(
  label: string,
  info: Uint8Array,
  suiteId: Uint8Array,
  len: number,
): Uint8Array {
  return concatBytes(
    new Uint8Array([0, len]),
    HPKE_VERSION,
    suiteId,
    utf8ToBytes(label),
    info,
  );
}

function extractAndExpand(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  len: number,
): Uint8Array {
  return new Uint8Array(expand(sha256, extract(sha256, ikm, salt), info, len));
}

/**
 * The application info string the enclave binds its key schedule to.
 *
 * **Not documented anywhere.** Turnkey ships the finished key schedule as a
 * precomputed 87 byte blob in `@turnkey/crypto`, which hides the one value in it
 * that is theirs rather than the RFC's. It was recovered by rebuilding the blob
 * from parts, finding `info_hash` was the only field that did not match, and
 * searching for the string that produces it.
 *
 * Worth having as a string rather than a blob: a reader can see what is standard
 * and what is Turnkey's, and if they ever change it the failure is this constant
 * rather than a decryption that yields nothing anybody can explain.
 */
const HPKE_INFO = "turnkey_hpke";

/**
 * The key schedule context: `mode || psk_id_hash || info_hash`.
 *
 * Base mode, no psk, and `info` as above. Both hashes are RFC 9180's
 * `LabeledExtract` with an empty salt.
 */
function keyScheduleContext(): Uint8Array {
  const empty = new Uint8Array([]);
  const pskIdHash = extract(sha256, labeledIkm("psk_id_hash", empty, SUITE_ID_HPKE), empty);
  const infoHash = extract(
    sha256,
    labeledIkm("info_hash", utf8ToBytes(HPKE_INFO), SUITE_ID_HPKE),
    empty,
  );
  return concatBytes(new Uint8Array([0]), pskIdHash, infoHash);
}

/**
 * Open one HPKE ciphertext with the ephemeral key this script generated.
 *
 * `aad` is the encapsulated sender key followed by our own public key. It is not
 * part of RFC 9180's base mode and it is not optional here: the enclave binds
 * the ciphertext to both halves of the exchange, so a bundle minted for a
 * different target key fails to open rather than opening to something wrong.
 */
function hpkeOpen(params: {
  ciphertext: Uint8Array;
  encappedKey: Uint8Array;
  receiverPriv: Uint8Array;
}): Uint8Array {
  /*
    **Uncompressed, 65 bytes, and it matters.** The encapsulated key goes into
    both the aad and the KEM context verbatim, so the compressed form of the same
    point derives a different AES key and fails at the GCM tag with nothing to
    read. Turnkey's own bundles that travel compressed are decompressed before
    they reach their decrypt for exactly this reason; the export bundle carries
    the uncompressed form already. Checked rather than assumed, because the
    failure is an opaque tag error a long way from here.
  */
  if (params.encappedKey.length !== 65 || params.encappedKey[0] !== 0x04) {
    throw new Error(
      `encapsulated key must be an uncompressed point, got ${params.encappedKey.length} bytes`,
    );
  }

  const receiverPub = p256.getPublicKey(params.receiverPriv, false);
  const aad = concatBytes(params.encappedKey, receiverPub);

  // The x coordinate of the ECDH point. noble returns the compressed form, so
  // dropping the leading parity byte is what leaves the 32 bytes DHKEM wants.
  const shared = p256.getSharedSecret(params.receiverPriv, params.encappedKey).slice(1);

  const kemContext = concatBytes(params.encappedKey, receiverPub);
  const sharedSecret = extractAndExpand(
    new Uint8Array([]),
    labeledIkm("eae_prk", shared, SUITE_ID_KEM),
    labeledInfo("shared_secret", kemContext, SUITE_ID_KEM, 32),
    32,
  );

  const context = keyScheduleContext();
  const secretIkm = labeledIkm("secret", new Uint8Array([]), SUITE_ID_HPKE);
  const key = extractAndExpand(
    sharedSecret,
    secretIkm,
    labeledInfo("key", context, SUITE_ID_HPKE, 32),
    32,
  );
  const iv = extractAndExpand(
    sharedSecret,
    secretIkm,
    labeledInfo("base_nonce", context, SUITE_ID_HPKE, 12),
    12,
  );

  return gcm(key, iv, aad).decrypt(params.ciphertext);
}

/* ------------------------------------------------------------------------- *
 * the run
 * ------------------------------------------------------------------------- */

type Activity = {
  activity: {
    id: string;
    status: string;
    failure?: { message?: string };
    result?: {
      exportWalletAccountResult?: { address: string; exportBundle: string };
      signRawPayloadResult?: { r: string; s: string; v: string };
    };
  };
};

async function main() {
  ORG = required("TURNKEY_ORGANIZATION_ID");
  API_PUBLIC = required("TURNKEY_API_PUBLIC_KEY");
  API_PRIVATE = required("TURNKEY_API_PRIVATE_KEY");

  console.log("\nFinding a wallet account to export");

  const account = await findProbeAccount({
    post,
    organizationId: ORG,
    walletName: process.env.TURNKEY_WALLET_NAME,
  });
  console.log(`  wallet ${account.walletName} · ${account.path} · ${account.address}`);

  /*
    The ephemeral target key.

    Generated per run and never written down, because it is the only thing that
    can open the bundle. In the app this is the same shape: a key that exists for
    one export and dies with it.
  */
  const targetPriv = p256.utils.randomPrivateKey();
  const targetPub = bytesToHex(p256.getPublicKey(targetPriv, false));

  console.log("\nAsking for the export");

  const res = await post<Activity>("/public/v1/submit/export_wallet_account", {
    type: "ACTIVITY_TYPE_EXPORT_WALLET_ACCOUNT",
    timestampMs: String(Date.now()),
    organizationId: ORG,
    parameters: { address: account.address, targetPublicKey: targetPub },
  });

  const completed = res.activity.status === "ACTIVITY_STATUS_COMPLETED";
  check(
    "the export activity completed",
    completed,
    completed
      ? undefined
      : `${res.activity.status}: ${res.activity.failure?.message ?? "no message"}. ` +
        `If this is a policy refusal, the recovery key plan needs a different route.`,
  );
  if (!completed) return;

  const bundle = res.activity.result?.exportWalletAccountResult?.exportBundle;
  if (!bundle) {
    check("the result carries an export bundle", false, "completed with no bundle");
    return;
  }

  console.log("\nThe bundle");

  const parsed = JSON.parse(bundle) as {
    enclaveQuorumPublic: string;
    dataSignature: string;
    data: string;
  };

  check(
    "the bundle names the pinned production signer key",
    parsed.enclaveQuorumPublic === SIGNER_PUBLIC_KEY,
    `bundle says ${parsed.enclaveQuorumPublic.slice(0, 24)}…`,
  );

  // The signature arrives DER encoded, and `message` here is the digest rather
  // than the data, which is why nothing asks noble to prehash it.
  const signedOk = p256.verify(
    hexToBytes(parsed.dataSignature),
    sha256(hexToBytes(parsed.data)),
    hexToBytes(parsed.enclaveQuorumPublic),
    { format: "der" },
  );
  check(
    "the enclave signature verifies over the bundle data",
    signedOk,
    "without this the bundle is whatever the endpoint decided to send",
  );
  if (!signedOk) return;

  const signedData = JSON.parse(
    new TextDecoder().decode(hexToBytes(parsed.data)),
  ) as { organizationId?: string; encappedPublic?: string; ciphertext?: string };

  check(
    "the bundle is addressed to this organization",
    signedData.organizationId === ORG,
    `bundle says ${signedData.organizationId ?? "nothing"}`,
  );

  if (!signedData.encappedPublic || !signedData.ciphertext) {
    check("the signed data carries an encapsulated key and a ciphertext", false);
    return;
  }

  const exported = hpkeOpen({
    ciphertext: hexToBytes(signedData.ciphertext),
    encappedKey: hexToBytes(signedData.encappedPublic),
    receiverPriv: targetPriv,
  });

  check(
    "the decrypted key is 32 bytes",
    exported.length === 32,
    `got ${exported.length}, so the port above is decrypting the wrong thing`,
  );
  if (exported.length !== 32) return;

  /*
    The strong check on the whole decryption path.

    A wrong key schedule, a wrong aad or a swapped byte order all produce 32
    plausible-looking bytes. Only deriving the address and finding the one
    Turnkey named proves those bytes are the key that was asked for.
  */
  const derivedAddress = address(secp256k1.getPublicKey(exported, false));
  check(
    "the exported key derives the wallet's own address",
    derivedAddress === account.address.toLowerCase(),
    `derived ${derivedAddress}, expected ${account.address.toLowerCase()}`,
  );
  if (derivedAddress !== account.address.toLowerCase()) return;

  console.log("\nThe question an exported key exists to answer");

  const message = eip191(SHIELDED_SIGN_MESSAGE);
  const digest = keccak_256(message);

  // noble is RFC 6979 with a low `s` by default, which is what every injected
  // wallet does. This is the reference the enclave is being measured against.
  const local = secp256k1.sign(digest, exported);
  const localHex =
    "0x" +
    local.r.toString(16).padStart(64, "0") +
    local.s.toString(16).padStart(64, "0") +
    (local.recovery + 27).toString(16).padStart(2, "0");

  const remote = await post<Activity>("/public/v1/submit/sign_raw_payload", {
    type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
    timestampMs: String(Date.now()),
    organizationId: ORG,
    parameters: {
      signWith: account.address,
      payload: "0x" + bytesToHex(message),
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: "HASH_FUNCTION_KECCAK256",
    },
  });
  const raw = remote.activity.result?.signRawPayloadResult;
  if (!raw) {
    check("Turnkey signed the same message for comparison", false);
    return;
  }
  const remoteHex = assemble(raw);

  console.log(`  local  r ${localHex.slice(2, 18)}…`);
  console.log(`  remote r ${remoteHex.slice(2, 18)}…`);

  check(
    "a local RFC 6979 signature is byte identical to the enclave's",
    localHex === remoteHex,
    "the enclave is deterministic but not RFC 6979, so an exported key opens a " +
      "different shielded account than this app shows. app-v2 and the dapp are " +
      "not one account space.",
  );

  check(
    "both signatures derive the same shielded account",
    deriveFromSignature(localHex).paymentAddress ===
      deriveFromSignature(remoteHex).paymentAddress,
    "the recovery key would open a balance the owner has never seen",
  );

  check(
    `r still matches the value frozen on 2026-08-12 (${FROZEN_R}…)`,
    remoteHex.slice(2, 18) === FROZEN_R,
    "the enclave's nonce derivation has moved. Every existing account derived " +
      "before today is now unreachable, and probe:turnkey cannot see this.",
  );

  console.log(
    failures === 0
      ? "\nAll checks passed. A key comes back out intact, and it is the same key an " +
          "injected wallet would hold."
      : `\n${failures} check(s) failed.`,
  );

  console.log(
    "\nNow delete that wallet. Its private key has been in a process on this\n" +
      "machine, which puts it in swap, in crash dumps and in every backup taken\n" +
      "since. It is a throwaway from here on, whatever it was before.\n",
  );

  if (failures > 0) process.exit(1);
}

/**
 * The HPKE port, reachable so it can be checked against Turnkey's own
 * implementation without a credential or a network.
 *
 * Same signal the underscore carries elsewhere in this repository: exported to
 * be tested, not to be called. An untested crypto port is this project's most
 * expensive kind of bug, because it fails by producing 32 plausible bytes.
 */
export const __hpke = { hpkeOpen, keyScheduleContext, labeledIkm, labeledInfo };

// Only when run, never when imported by the test above.
if (process.argv[1]?.endsWith("exportprobe.mts")) {
  main().catch((err) => {
    console.error(`\n${(err as Error).message}\n`);
    process.exit(1);
  });
}
