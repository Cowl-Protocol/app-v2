/**
 * The architecture rules, tested in both directions. `npm run test:boundary`.
 *
 * README.md claims six rules are enforced by `import/no-restricted-paths`. A
 * lint rule can be wrong in two ways and only one of them is loud:
 *
 *   it fails to block something it should      caught the first time someone
 *                                              imports the wrong thing
 *   it blocks something it should allow        looks like enforcement working,
 *                                              right up until the feature that
 *                                              needs the import cannot be built
 *
 * The second one shipped. `KEY_CONSUMERS` named `auth` and `shielded` as the two
 * features allowed to touch key material, and the cross-feature zone blocked
 * every cross-feature import including a public `index.ts`, so both were refused
 * and the allowlist was unreachable code. It went unnoticed because the rules
 * had only ever been exercised with imports that were supposed to fail. Found
 * 2026-08-03, when `auth` first needed to derive a key.
 *
 * So every case below carries an expectation of `allow` or `block`, and an
 * `allow` that errors fails this script exactly as loudly as a `block` that
 * passes. Fixtures are written, linted, and deleted on the way out including on
 * a signal, because a timeout kill skips a plain `finally` and would leave
 * probe files in the tree.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";

const PROBE = "__boundary_probe.ts";

/**
 * `from` is the folder the import is written in, `code` is the import. Keep the
 * reason on every case: a case with no stated reason is one somebody deletes
 * when it becomes inconvenient.
 */
const CASES = [
  // The keys boundary, which is the rule the whole product rests on.
  {
    from: "src/features/auth",
    expect: "allow",
    code: `import { deriveFromSignature } from "@/features/keys";`,
    why: "auth derives the shielded account once a signature comes back",
  },
  {
    from: "src/features/shielded",
    expect: "allow",
    code: `import { deriveFromSignature } from "@/features/keys";`,
    why: "shielded needs the secret in-process to build a proof",
  },
  {
    from: "src/features/pay",
    expect: "block",
    code: `import { deriveFromSignature } from "@/features/keys";`,
    why: "a payer never holds the recipient's key, and pay is not a key consumer",
  },
  {
    from: "src/features/portfolio",
    expect: "block",
    code: `import { deriveFromSignature } from "@/features/keys";`,
    why: "reading balances does not require the spending key",
  },
  {
    from: "src/features/auth",
    expect: "block",
    code: `import { deriveFromSignature } from "@/features/keys/lib/derive";`,
    why: "even a key consumer goes through the public index, never a file inside",
  },
  {
    from: "src/lib",
    expect: "block",
    code: `import { deriveFromSignature } from "@/features/keys";`,
    why: "shared code holding a key derivation is how a secret escapes into a helper",
  },

  // The second way key material leaves a feature, and the one that made the
  // rule above false for a while. The signed in keys live in auth's context, so
  // exporting them from `auth/index.ts` handed the view key to every feature in
  // the app with a clean lint: the zones restrict paths, and every feature may
  // import a neighbour's index. `auth/keys.ts` is a separate entry point that
  // only shielded may reach. All three cases are needed, because the allow is
  // what makes the block a boundary rather than a wall.
  {
    from: "src/features/shielded",
    expect: "allow",
    code: `import { useShieldedKeys } from "@/features/auth/keys";`,
    why: "shielded is the one feature that has to hold the spending key to prove",
  },
  {
    from: "src/features/portfolio",
    expect: "block",
    code: `import { useShieldedKeys } from "@/features/auth/keys";`,
    why: "a balance screen reading the unrotatable view key is the leak this rule exists for",
  },
  {
    from: "src/features/pay",
    expect: "block",
    code: `import { useShieldedKeys } from "@/features/auth/keys";`,
    why: "a payer holds nobody's key, least of all through a side door in auth",
  },
  {
    from: "src/features/portfolio",
    expect: "allow",
    code: `import { useAccount } from "@/features/auth";`,
    why: "the public surface of auth carries no key material, so it stays open to everyone",
  },

  // Public data must stay reachable, or someone widens the keys rule to get it.
  {
    from: "src/features/pay",
    expect: "allow",
    code: `import { decodePaymentAddress } from "@/lib/payment-address";`,
    why: "decoding a published address is exactly what a payer does, and it holds no secret",
  },
  {
    from: "src/features/request",
    expect: "allow",
    code: `import { encodePaymentAddress } from "@/lib/payment-address";`,
    why: "request renders an address it was handed, without touching keys",
  },

  // Cross-feature traffic: index yes, internals no.
  {
    from: "src/features/pay",
    expect: "allow",
    code: `import * as portfolio from "@/features/portfolio";`,
    why: "the neighbour's public surface is the supported way across",
  },
  {
    from: "src/features/pay",
    expect: "block",
    // Deliberately a file that exists. `no-restricted-paths` compares resolved
    // paths, so it cannot restrict an import it cannot resolve: a deep import
    // of a file that is not there is a module error, not a boundary error. A
    // probe pointing at an imaginary file therefore passes lint and reads as a
    // hole in the rule. It is not one, but every case here has to name a real
    // file or it tests the resolver instead of the boundary.
    code: `import { LoginCard } from "@/features/auth/components/login-card";`,
    why: "reaching past index.ts freezes the neighbour's internals in place",
  },

  // Direction of dependency, and the shared layer staying shared.
  {
    from: "src/features/auth",
    expect: "block",
    // `@/app/page` and not `@/app/login/page`. This case caught its own probe
    // going stale the day `/login` and `/home` were folded into one route: the
    // import stopped resolving, so the rule had nothing to restrict and the
    // block silently passed as an allow. That is the resolver limitation
    // recorded above, arriving as a real failure rather than as a note.
    code: `import Page from "@/app/page";`,
    why: "a feature that imports a route has been written backwards",
  },
  {
    from: "src/lib",
    expect: "block",
    code: `import * as pay from "@/features/pay";`,
    why: "the moment a helper knows what a payment is, it is not shared code",
  },
  {
    from: "src/config",
    expect: "block",
    code: `import * as auth from "@/features/auth";`,
    why: "config is read by everything, so it may depend on nothing",
  },
  {
    from: "src/components",
    expect: "block",
    code: `import * as shielded from "@/features/shielded";`,
    why: "a primitive that knows what a note is is not a primitive",
  },

  // Storage. The other half of the privacy contract, enforced by a separate rule.
  {
    from: "src/features/shielded",
    expect: "block",
    code: `export const save = (v: string) => localStorage.setItem("k", v);`,
    why: "a shielded key in localStorage outlives the tab, the session and the user's attention",
  },
  {
    from: "src/features/auth",
    expect: "block",
    code: `export const save = (v: string) => window.sessionStorage.setItem("k", v);`,
    why: "same rule through the window object, which is the obvious way around it",
  },
  {
    // The API this rule is really for. Turnkey's own stamper keeps the session
    // key in IndexedDB and its SDK does so by default, and that key can ask an
    // enclave to sign the message the view key derives from. The rule listed
    // only the two Storage APIs until 2026-08-08, so the one door that mattered
    // was open and lint was green.
    from: "src/features/auth",
    expect: "block",
    code: `export const open = () => indexedDB.open("cowl");`,
    why: "IndexedDB is where an embedded wallet SDK puts a session key, which is a route back to the view key",
  },
  {
    from: "src/features/shielded",
    expect: "block",
    code: `export const save = (v: string) => { document.cookie = "k=" + v; };`,
    why: "a cookie is storage that also travels with every request",
  },
];

const written = [];
function cleanup() {
  for (const f of written) rmSync(f, { force: true });
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

// Never clobber real source. A probe path that already exists means either a
// previous run died badly or somebody named a file this, and both want a human.
for (const c of CASES) {
  const path = `${c.from}/${PROBE}`;
  if (existsSync(path)) {
    console.error(`\n${path} already exists. Refusing to overwrite it.\n`);
    process.exit(2);
  }
}

/** One probe per folder, so the same folder's cases are linted together. */
const byFolder = new Map();
for (const c of CASES) {
  if (!byFolder.has(c.from)) byFolder.set(c.from, []);
  byFolder.get(c.from).push(c);
}

let failures = 0;
console.log("\nArchitecture boundaries, allow and block\n");

for (const [folder, cases] of byFolder) {
  for (const c of cases) {
    const path = `${folder}/${PROBE}`;
    writeFileSync(path, `${c.code}\nexport const _probe = 1;\n`);
    written.push(path);

    let messages = [];
    try {
      const out = execFileSync(
        "npx",
        ["eslint", "--no-ignore", "--format", "json", path],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      messages = JSON.parse(out)[0]?.messages ?? [];
    } catch (e) {
      // eslint exits non-zero when it reports errors, which is the normal case
      // for every `block`. The report is still on stdout.
      try {
        messages = JSON.parse(e.stdout || "[]")[0]?.messages ?? [];
      } catch {
        console.error(`\n  eslint could not be read for ${path}\n${e.stderr || e.message}`);
        failures++;
        rmSync(path, { force: true });
        continue;
      }
    }
    rmSync(path, { force: true });

    const relevant = messages.filter(
      (m) =>
        m.ruleId === "import/no-restricted-paths" ||
        m.ruleId === "no-restricted-globals" ||
        m.ruleId === "no-restricted-properties",
    );
    const blocked = relevant.length > 0;
    const ok = c.expect === "block" ? blocked : !blocked;
    if (!ok) failures++;

    const label = `${c.expect.padEnd(5)} ${folder.replace("src/", "")} · ${c.why}`;
    console.log(ok ? `  ok    ${label}` : `  FAIL  ${label}`);
    if (!ok && c.expect === "allow") {
      console.log(`          wrongly blocked: ${relevant.map((m) => m.message).join(" | ")}`);
    }
    if (!ok && c.expect === "block") {
      console.log("          nothing stopped it");
    }
  }
}

console.log(
  failures === 0
    ? `\nAll ${CASES.length} boundary cases behave as documented.\n`
    : `\n${failures} of ${CASES.length} boundary cases are wrong.\n`,
);
process.exit(failures === 0 ? 0 : 1);
