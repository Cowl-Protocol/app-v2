/**
 * Ask Privy the two questions the offline tests cannot, run with
 * `npm run probe:privy`.
 *
 *   1. **Is a Privy signature the same bytes every time?**
 *   2. **Are those the bytes RFC 6979 produces for the same private key?**
 *
 * The whole shielded account in this app is derived from the bytes of one
 * signature over one fixed message. Privy signs inside a TEE and documents
 * neither property, exactly as Turnkey documented neither before
 * `probe:turnkey` and `probe:export` settled them.
 *
 * **The two failures are different sizes and it is worth knowing which is
 * which.** Non-determinism is loud: `unlock.ts` signs twice and refuses when the
 * bytes differ, so nobody loses money, they just cannot sign in. A deterministic
 * nonce that is **not** RFC 6979 is silent and worse: accounts would be stable
 * here and **fork from the dapp**, one wallet would open two different shielded
 * balances depending on which client held it, and an exported key would open the
 * wrong one in MetaMask. Nothing in the app can detect that. Only this can.
 *
 * **This probe is decisive where the Turnkey one could not be.** Turnkey had to
 * export a key to answer question 2. Privy accepts an imported private key, so
 * the second half hands Privy a key generated here and compares its answer
 * against noble's, byte for byte, with no export and no real account involved.
 *
 * Two subjects, and the split is deliberate rather than redundant:
 *
 *   · A wallet **Privy generated** answers question 1 on the exact path the app
 *     uses, where the key was born in the TEE and nothing outside it has ever
 *     held the bytes.
 *   · A wallet **we imported** answers question 2, on a path Privy states is
 *     identical ("imported wallets function the same way as Privy-generated
 *     wallets"). That is their claim, not our measurement, and it is named here
 *     rather than buried so a later reader knows which half rests on it.
 *
 * Nothing here touches a chain, moves value, or costs gas.
 *
 *   PRIVY_APP_ID=...     \
 *   PRIVY_APP_SECRET=... \
 *   npm run probe:privy
 *
 * The app secret is a server credential. **Run this from a laptop and never put
 * it in the app**, which is why it is not `NEXT_PUBLIC_` and why nothing under
 * `src/` reads it.
 *
 * **Freeze the subject after the first run.** Set `PRIVY_PROBE_WALLET_ID` and
 * `PRIVY_PROBE_FROZEN_R` to the values printed below and re-run on another day.
 * Signing four times in one session catches non-determinism; it cannot catch a
 * change to a *different* deterministic scheme later, because two signatures in
 * one session would still agree while every account silently moved. Only a value
 * frozen across days notices that, which is what makes this a canary rather than
 * a one-off errand.
 */
import { PrivyClient } from "@privy-io/node";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { SHIELDED_SIGN_MESSAGE } from "../src/features/keys";
import { __unlock } from "../src/features/auth/lib/unlock";

const { eip191, normalise, address } = __unlock;

const APP_ID = required("PRIVY_APP_ID");
const APP_SECRET = required("PRIVY_APP_SECRET");

/** The frozen subject, so a re-run on another day compares against the same key. */
const FROZEN_WALLET = process.env.PRIVY_PROBE_WALLET_ID ?? "";
/** The frozen answer. See the header: this is the half a single session cannot check. */
const FROZEN_R = (process.env.PRIVY_PROBE_FROZEN_R ?? "").replace(/^0x/, "").toLowerCase();

/** How many signatures to compare. Two proves it; four makes a rare collision implausible. */
const ROUNDS = 4;

/**
 * A digest to raw-sign, chosen to be recognisable in a log and to be nothing.
 * It is not a message hash of anything, which is the point: `secp256k1_sign`
 * takes a digest and signs it, so this isolates the nonce question from every
 * question about prefixes and encodings.
 */
const RAW_DIGEST = "0x" + "cow1".repeat(16).slice(0, 64);

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
 * The three fields of a joined 65 byte signature, for reading and for the low-s
 * check.
 *
 * **Only `normalise` from `unlock.ts` decides what a signature is here.** This
 * splits a copy for the parts the checks below name individually; it is not a
 * second opinion on the format. A probe that agreed with Privy while disagreeing
 * with the code that derives the key would prove the wrong thing.
 */
function split(joined: string): { r: string; s: string; v: string } {
  const hex = joined.replace(/^0x/, "");
  if (hex.length !== 130) {
    throw new Error(`expected 65 bytes of signature, got ${hex.length / 2}`);
  }
  return {
    r: hex.slice(0, 64),
    s: hex.slice(64, 128),
    v: hex.slice(128),
  };
}

/** Last 20 bytes of the keccak of the uncompressed public key, minus its 0x04 tag. */
function addressOf(privateKey: Uint8Array): string {
  return address(secp256k1.getPublicKey(privateKey, false));
}

const privy = new PrivyClient({ appId: APP_ID, appSecret: APP_SECRET });

const MESSAGE = eip191(SHIELDED_SIGN_MESSAGE);
const MESSAGE_DIGEST = keccak_256(MESSAGE);

/* ------------------------------------------------------------------------- *
 * question 1: is it the same bytes every time
 * ------------------------------------------------------------------------- */

async function determinism(): Promise<void> {
  console.log("\nQuestion 1 · is a Privy signature the same bytes every time");

  let walletId = FROZEN_WALLET;
  let walletAddress: string;

  if (walletId) {
    const wallet = await privy.wallets().get(walletId);
    walletAddress = wallet.address;
    console.log(`  subject  frozen wallet ${walletId} · ${walletAddress}`);
  } else {
    const wallet = await privy.wallets().create({ chain_type: "ethereum" });
    walletId = wallet.id;
    walletAddress = wallet.address;
    console.log(`  subject  NEW wallet ${walletId} · ${walletAddress}`);
    console.log("           freeze it: PRIVY_PROBE_WALLET_ID=" + walletId);
  }

  console.log(`\n  Signing the unlock message ${ROUNDS} times`);
  const signatures: string[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const res = await privy
      .wallets()
      .ethereum()
      .signMessage(walletId, { message: SHIELDED_SIGN_MESSAGE });
    const parts = split(res.signature);
    signatures.push(normalise(res.signature));
    console.log(`    ${i} · r ${parts.r.slice(0, 16)}… s ${parts.s.slice(0, 16)}… v ${parts.v}`);
  }

  const identical = signatures.every((x) => x === signatures[0]);
  check(
    "every signature is byte identical",
    identical,
    identical
      ? undefined
      : "signatures differ, so the shielded account would change every session:\n          " +
          signatures.join("\n          "),
  );

  const first = signatures[0]!;
  const parts = split(first);

  check(
    "s is on the low half of the curve",
    BigInt("0x" + parts.s) <= secp256k1.CURVE.n / 2n,
    "a high s is still valid ECDSA, and would not match this key in an injected wallet",
  );

  const recovered = address(
    secp256k1.Signature.fromCompact(hexToBytes(first.slice(2, 130)))
      .addRecoveryBit(Number.parseInt(first.slice(130), 16) - 27)
      .recoverPublicKey(MESSAGE_DIGEST)
      .toRawBytes(false),
  );
  check(
    "the signature recovers the wallet's own address",
    recovered === walletAddress.toLowerCase(),
    `recovered ${recovered}, wallet is ${walletAddress.toLowerCase()}`,
  );

  /*
    The canary. A first run has nothing to compare against and says so rather
    than passing, because a check that cannot fail is not a check · the same
    reasoning that makes `test:boundary` assert its allows.
  */
  if (!FROZEN_R) {
    console.log(
      `  note  no frozen r to compare against. Freeze this one and re-run on another day:\n` +
        `        PRIVY_PROBE_FROZEN_R=${parts.r}`,
    );
  } else {
    check(
      "r matches the frozen value from a previous day",
      parts.r === FROZEN_R,
      `r is now ${parts.r}, frozen value is ${FROZEN_R}.\n` +
        `          Privy changed how it derives the nonce. Every existing account has moved.`,
    );
  }
}

/* ------------------------------------------------------------------------- *
 * question 2: are they RFC 6979 bytes
 * ------------------------------------------------------------------------- */

async function rfc6979(): Promise<void> {
  console.log("\nQuestion 2 · are those the bytes RFC 6979 produces for the same key");

  /*
    Generated here, held here, and handed to Privy. It is burned by construction:
    the bytes have been in a process on this laptop, so its custody guarantee is
    gone before it exists. It holds nothing and it must never be funded, which is
    what the name is for.
  */
  const privateKey = secp256k1.utils.randomPrivateKey();
  const expectedAddress = addressOf(privateKey);
  console.log(`  subject  throwaway imported key · ${expectedAddress}`);

  const imported = await privy.wallets().import({
    wallet: {
      entropy_type: "private-key",
      chain_type: "ethereum",
      address: expectedAddress,
      private_key: bytesToHex(privateKey),
    },
  });

  check(
    "Privy imported the key and agrees on its address",
    imported.address.toLowerCase() === expectedAddress,
    `Privy says ${imported.address.toLowerCase()}, the key derives ${expectedAddress}`,
  );

  /*
    The raw digest first, because it isolates the nonce. `secp256k1_sign` takes a
    digest and signs it, so a mismatch here is the nonce and nothing else · no
    prefix, no encoding, no hash function in the way.
  */
  const raw = await privy
    .wallets()
    .ethereum()
    .signSecp256k1(imported.id, { params: { hash: RAW_DIGEST } });

  const rawLocal = secp256k1.sign(hexToBytes(RAW_DIGEST.slice(2)), privateKey);
  const rawParts = split(raw.signature);
  check(
    "a raw digest signature is byte identical to noble's RFC 6979",
    rawParts.r === rawLocal.r.toString(16).padStart(64, "0") &&
      rawParts.s === rawLocal.s.toString(16).padStart(64, "0"),
    `Privy  r ${rawParts.r}\n          ` +
      `        s ${rawParts.s}\n          ` +
      `noble  r ${rawLocal.r.toString(16).padStart(64, "0")}\n          ` +
      `        s ${rawLocal.s.toString(16).padStart(64, "0")}\n          ` +
      `Deterministic but not RFC 6979 means this app forks from the dapp silently.`,
  );

  /*
    Then the real path, end to end. This is the one the app actually walks:
    `personal_sign` over the unlock message, EIP-191 prefix applied by whoever
    applies it, keccak, sign. If this matches, one wallet opens one shielded
    account whichever client is holding it, which is the claim README makes.
  */
  const personal = await privy
    .wallets()
    .ethereum()
    .signMessage(imported.id, { message: SHIELDED_SIGN_MESSAGE });

  const local = secp256k1.sign(MESSAGE_DIGEST, privateKey);
  const localJoined =
    "0x" +
    local.r.toString(16).padStart(64, "0") +
    local.s.toString(16).padStart(64, "0") +
    (local.recovery + 27).toString(16).padStart(2, "0");

  check(
    "the unlock signature is byte identical to noble's RFC 6979",
    normalise(personal.signature) === localJoined,
    `Privy ${normalise(personal.signature)}\n          noble ${localJoined}\n          ` +
      `These are the bytes the shielded key is derived from, so a mismatch is a different account.`,
  );
}

/* ------------------------------------------------------------------------- *
 * the run
 * ------------------------------------------------------------------------- */

async function main() {
  await determinism();
  await rfc6979();

  console.log("\nWhat this run does and does not settle");
  console.log(
    "  · Question 1 was answered on a wallet Privy generated, which is the path\n" +
      "    the app uses. Question 2 was answered on an imported wallet, on Privy's\n" +
      "    own statement that the two behave identically. That statement is theirs,\n" +
      "    not a measurement made here.",
  );

  if (failures === 0) {
    console.log(
      "\nAll checks passed. Signature derived keys are safe on this provider today,\n" +
        "and app-v2 shares one shielded account space with the dapp and the CLI.\n" +
        "\nRe-run with the frozen values on another day. Determinism inside one session\n" +
        "cannot see a scheme that changed between sessions.\n",
    );
  } else {
    console.log(
      `\n${failures} check(s) failed. Do not ship signature derived keys on this provider,\n` +
        "and do not let anybody hold a balance behind it.\n",
    );
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
});
