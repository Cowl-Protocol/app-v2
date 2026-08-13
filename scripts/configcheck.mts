/**
 * The config layer, checked rather than described. Run with `npm run test:config`.
 *
 * Two things are pinned here, and both are the same class of failure: a value
 * that is wrong in a way nothing downstream can notice.
 *
 * **Which chain a build lands on.** `NEXT_PUBLIC_COWL_NETWORK` decides where a
 * balance is read from, and the two failure modes are silent in opposite
 * directions: a mainnet build that quietly fell back to testnet reads an empty
 * pool, which looks exactly like an account with no money in it, and a testnet
 * build that reached mainnet is real money in a rehearsal. So the default is
 * asserted, and so is the refusal.
 *
 * **What the token registry says.** Decimals decide where the point goes, so an
 * entry that is wrong by one is wrong by a factor of ten while rendering
 * perfectly. Addresses are checked for EIP-55, which is what catches a hand
 * typo: a mistyped address fails its own checksum with overwhelming probability,
 * and it is the same check every wallet applies before sending anywhere.
 *
 * **The selection is checked twice, deliberately.** The rule itself runs in this
 * process against a value it is handed. The wiring runs in a child process with
 * a real environment variable set, because a pure function nothing calls passes
 * every test it has and ships a build on the wrong chain. This project has
 * already shipped that shape once: `KEY_CONSUMERS` was an allowlist the zones
 * made unreachable, and it read as enforced for weeks.
 *
 * **One limit, worth knowing.** Here `process.env` is read at runtime. Under
 * `next build` these names are substituted into the bundle as literals instead,
 * so this script exercises the logic and the build exercises the substitution.
 * Neither substitutes for the other.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

const SELF = fileURLToPath(import.meta.url);

/**
 * Child mode. Loads the config with whatever environment it was handed and
 * prints the network the app would actually run against.
 *
 * A second process rather than a second import: the network is chosen once at
 * module load, and Node caches a module per specifier, so every later read in
 * one process is the first read's answer wearing a different name. That is not
 * hypothetical, it is what the first version of this script did while reporting
 * five passes.
 */
if (process.argv.includes("--probe")) {
  const { ACTIVE_NETWORK } = await import("../src/config/networks");
  console.log(ACTIVE_NETWORK.key);
  process.exit(0);
}

let failures = 0;
let checks = 0;

function ok(label: string) {
  checks++;
  console.log(`  ok    ${label}`);
}

function fail(label: string, detail: string) {
  checks++;
  failures++;
  console.log(`  FAIL  ${label}\n        ${detail}`);
}

function is(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) ok(label);
  else fail(label, `expected ${String(expected)}, got ${String(actual)}`);
}

const { NETWORKS, ACTIVE_NETWORK, __networks } = await import("../src/config/networks");
const { TOKENS, ACTIVE_TOKENS, tokenOn } = await import("../src/config/tokens");
const { resolveNetwork } = __networks;

console.log("\nThe selection rule\n");

is("unset lands on testnet, so an omission is never the expensive case", resolveNetwork(undefined).key, "robinhood-testnet");
is("empty is the same as unset, not a refusal", resolveNetwork("").key, "robinhood-testnet");
is("whitespace alone is the same as unset", resolveNetwork("   ").key, "robinhood-testnet");
is("a name with whitespace around it still resolves", resolveNetwork("  robinhood-mainnet  ").key, "robinhood-mainnet");
is("mainnet is reachable, and only by naming it", resolveNetwork("robinhood-mainnet").key, "robinhood-mainnet");
is("testnet is flagged as a test chain, which is what a warning renders from", resolveNetwork("robinhood-testnet").testnet, true);
is("mainnet is not", resolveNetwork("robinhood-mainnet").testnet, false);

for (const value of [
  "robinhood-testnett", // one key away from a real one
  "testnet", // the short name somebody will reach for
  "ROBINHOOD-TESTNET", // right name, wrong case
  "toString", // a key every object has, and no network does
  "constructor",
]) {
  try {
    const got = resolveNetwork(value);
    fail(`"${value}" is refused rather than quietly defaulted`, `it resolved to ${got.key}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("NEXT_PUBLIC_COWL_NETWORK") && message.includes(value)) {
      ok(`"${value}" is refused, and the message names both the variable and the value`);
    } else {
      fail(`"${value}" is refused with a message somebody can act on`, message);
    }
  }
}

console.log("\nThe wiring, in a build's own process\n");

/** What a build with this environment would actually run against. */
function probe(value: string | undefined): { key: string } | { error: string } {
  const env = { ...process.env };
  if (value === undefined) delete env.NEXT_PUBLIC_COWL_NETWORK;
  else env.NEXT_PUBLIC_COWL_NETWORK = value;

  try {
    const out = execFileSync(process.execPath, ["--import", "tsx", SELF, "--probe"], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { key: out.trim() };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return { error: err.stderr || err.message || "" };
  }
}

{
  const unset = probe(undefined);
  is("a build told nothing runs on testnet", "key" in unset ? unset.key : unset.error, "robinhood-testnet");

  const mainnet = probe("robinhood-mainnet");
  is("the variable reaches ACTIVE_NETWORK, so the rule is not decoration", "key" in mainnet ? mainnet.key : mainnet.error, "robinhood-mainnet");

  const bad = probe("robinhood-mainet");
  if ("error" in bad && bad.error.includes("NEXT_PUBLIC_COWL_NETWORK")) {
    ok("a typo takes the whole build down rather than shipping the wrong chain");
  } else {
    fail("a typo takes the build down", "key" in bad ? `it loaded ${bad.key}` : bad.error.slice(0, 200));
  }
}

console.log("\nNetworks\n");

{
  const ids = Object.values(NETWORKS).map((n) => n.chainId);
  if (new Set(ids).size === ids.length) ok("no two networks share a chain id, so a link resolves to one of them");
  else fail("chain ids are unique", `duplicates in ${ids.join(", ")}`);

  for (const [key, net] of Object.entries(NETWORKS)) {
    is(`${key} · its key matches the record it is filed under`, net.key, key);
    checkAddress(`${key} · pool address passes EIP-55`, net.contracts.pool);
    if (net.contracts.poolDeployBlock > 0n) ok(`${key} · has a deploy block, so a log replay has a floor`);
    else fail(`${key} · has a deploy block`, "a replay from genesis is refused by every public RPC");
    if (net.rpcFallbacks.length > 0) ok(`${key} · has somewhere to go when its RPC stops answering`);
    else fail(`${key} · has an RPC fallback`, "public endpoints go down, and one entry is a single point of failure");
  }
}

console.log("\nTokens\n");

for (const [key, tokens] of Object.entries(TOKENS)) {
  const symbols = tokens.map((t) => t.symbol);
  if (new Set(symbols).size === symbols.length) ok(`${key} · no two entries claim the same symbol`);
  else fail(`${key} · symbols are unique`, `duplicates in ${symbols.join(", ")}`);

  is(`${key} · exactly one native token`, tokens.filter((t) => t.native).length, 1);

  for (const t of tokens) {
    const label = `${key} · ${t.symbol}`;

    if (Number.isInteger(t.decimals) && t.decimals >= 0 && t.decimals <= 36) ok(`${label} · decimals are a plausible integer`);
    else fail(`${label} · decimals are a plausible integer`, `got ${t.decimals}`);

    if (t.native) {
      if (t.address === undefined) ok(`${label} · native, so it carries no contract to call`);
      else fail(`${label} · native tokens carry no address`, `got ${t.address}`);
    } else if (t.address === undefined) {
      fail(`${label} · an ERC-20 needs an address`, "absent");
    } else {
      checkAddress(`${label} · address passes EIP-55`, t.address);
    }

    if (t.name.trim()) ok(`${label} · has a name to render`);
    else fail(`${label} · has a name to render`, "empty");
  }
}

console.log("\nLookups\n");

{
  const testnet = NETWORKS["robinhood-testnet"];
  const mainnet = NETWORKS["robinhood-mainnet"];

  is("USDG on mainnet is the 6 decimal Global Dollar", tokenOn(mainnet, "USDG")?.decimals, 6);
  is("USDG on testnet is the 6 decimal stand-in, read from its own source", tokenOn(testnet, "USDG")?.decimals, 6);
  is("WETH is 18 either side", tokenOn(testnet, "WETH")?.decimals, 18);

  /* The lookup takes the network for this reason. If it read the active one
     instead, a payment link naming the other chain would be priced against the
     wrong token in exactly the case the chain check exists to catch. */
  const here = tokenOn(testnet, "USDG")?.address;
  const there = tokenOn(mainnet, "USDG")?.address;
  if (here !== there) ok("the same symbol resolves to a different contract per network");
  else fail("the same symbol resolves per network", `both are ${here}`);

  is("COWL has no testnet deployment, and the lookup says so rather than guessing", tokenOn(testnet, "COWL"), undefined);
  is("COWL is on mainnet", tokenOn(mainnet, "COWL")?.decimals, 18);
  is("an uncurated ticker is not invented", tokenOn(mainnet, "AAPL"), undefined);
  is("the match is case sensitive, the same as the table it replaced", tokenOn(mainnet, "usdg"), undefined);
  is("the active build's token set is its own network's", ACTIVE_TOKENS, TOKENS[ACTIVE_NETWORK.key]);
}

/** EIP-55: the mixed case is a checksum over the address, and a typo breaks it. */
function checkAddress(label: string, address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail(label, `not 20 hex bytes: ${address}`);

  const lower = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(lower));
  let expected = "0x";
  for (let i = 0; i < lower.length; i++) {
    expected += parseInt(hash[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
  }

  if (expected === address) ok(label);
  else fail(label, `checksum says ${expected}`);
}

console.log(
  failures === 0
    ? `\nAll ${checks} config checks pass.\n`
    : `\n${failures} of ${checks} config checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
