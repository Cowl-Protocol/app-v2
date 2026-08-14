import Link from "next/link";
import { Eyes } from "@/components/brand/eyes";
import { NetworkSelect } from "@/components/layout/network-select";
import { Bevel, tagClip } from "@/components/ui/bevel";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

/**
 * The bar across the top of every signed in screen.
 *
 * **The chain picker is the one wired thing on it.** The nav is still text with
 * one item marked current rather than links to routes that do not exist yet, and
 * the account button still opens nothing. A dead link is worse than an obviously
 * unfinished one: it looks like the app is broken instead of like it is being
 * built.
 *
 * The rail is the bar's whole structure. It runs out of the mark's bracket box,
 * crosses the empty space, meets the nav at a point, comes out the far side and
 * carries on to the profile. Both ends of the nav tag are cut to 45 degrees so
 * the line appears to pass through it rather than stopping at a box that happens
 * to be in the way, which is the difference between an instrument panel and a
 * row of buttons with a line behind them.
 *
 * **The bar names a chain again, and this time it changes one.** The old chip
 * was a label and it came out on the owner's call; what replaced it on
 * 2026-08-14 is `NetworkSelect`, which owns the network the whole session reads
 * from. The argument for having it is the one the old chip had, that nothing
 * else on this screen tells a testnet balance from real money, and the argument
 * for it being a control is that the alternative was a rebuild per chain.
 *
 * **The bar still names no address.** This app provisions the wallet, and
 * somebody who signed in with Google has no reason to be handed a hex string
 * they did not choose and cannot use. The address that matters to them is the
 * `zcowl1…` one on the Receive panel, and it is the only one they ever give out.
 */

const NAV = ["Home", "Activity", "Settings"] as const;

const TAG = tagClip();

export function AppBar({ profile }: { profile: Profile | null }) {
  return (
    /*
      Full width inside the frame rather than boxed to the content column. The
      bar is mounted on the housing, not floating above the grid: the mark sits
      near the frame's left edge and the chips near its right, and the rail has
      the whole span to run across. Constrained to the column it read as a fifth
      card that happened to have a line through it.
    */
    <header className="relative z-10 flex h-16 items-center gap-3 px-4 md:gap-5 md:px-6">
      {/*
        The box is wider than it is tall because the mark is. The pair of blades
        is roughly four to one, and a square sight around it leaves a band of
        empty space above and below that reads as the artwork having failed to
        fill its container.
      */}
      <Link
        href="/"
        aria-label="Cowl"
        className="relative grid h-8 w-[54px] shrink-0 place-items-center"
      >
        <BracketBox />
        <Eyes className="w-[34px] text-mark" />
      </Link>

      <Rule />

      {/*
        Below `md` the rails and the tag come out together. A chamfered tag with
        no line running into it is a decorated pill, and the shape only means
        anything while the rail is there to be interrupted.
      */}
      <Bevel clip={TAG} className="hidden shrink-0 md:block">
        <nav className="flex items-center gap-5 px-7 py-2.5">
          {NAV.map((item, i) => (
            <span
              key={item}
              className={cn(
                "font-mono text-[10.5px] tracking-[0.18em] uppercase",
                i === 0 ? "text-bone" : "text-bone/35",
              )}
            >
              {item}
            </span>
          ))}
        </nav>
      </Bevel>

      <Rule />

      {/*
        The chain sits to the left of the account, which is the order the two
        are decided in: which chain is being read, then who is reading it. Both
        collapse toward the mark on a phone, and the gap is small enough that
        they read as one cluster rather than as two unrelated controls that
        happen to share an edge.
      */}
      <div className="ml-auto flex min-w-0 items-center gap-2 md:ml-0">
        <NetworkSelect />
        {/*
          No account, no account control. That is the `SKIP_LOGIN` layout case
          and nothing else, and a chip showing initials nobody has would open a
          menu about a session that does not exist.
        */}
        {profile && <ProfileButton profile={profile} />}
      </div>
    </header>
  );
}

/**
 * The account control. **Layout only, it opens nothing yet.**
 *
 * A name and a mark, not an address and not an email. It is a button rather than
 * a label because everything a person needs to do with their account, see which
 * one they are in, export the wallet, sign out, lives behind it, and a label that
 * looks pressable but is not is worse than one that plainly is not.
 *
 * The name collapses away on a phone and the mark carries it alone. At that
 * width the bar is competing with a balance for the same row, and the person
 * reading it already knows who they are.
 */
function ProfileButton({ profile }: { profile: Profile }) {
  return (
    <button
      type="button"
      className="flex h-9 items-center gap-2.5 bg-white/[0.04] pr-2.5 pl-1.5 transition-colors hover:bg-white/[0.08]"
    >
      <Initials name={profile.name} />
      <span className="hidden max-w-[140px] truncate font-mono text-[11px] text-bone/75 sm:inline">
        {profile.name}
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="size-3 shrink-0 text-bone/40"
      >
        <path d="M6 9.5 12 15.5 18 9.5" />
      </svg>
    </button>
  );
}

/**
 * Up to two letters, one per word. A single name gives one letter rather than
 * its first two: "De" reads as a word cut in half, "D" reads as a monogram.
 */
function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center bg-white/[0.09] font-mono text-[10px] text-bone/80"
    >
      {letters}
    </span>
  );
}

/** A length of rail. Flexes, so the nav tag stays centred as the bar resizes. */
function Rule() {
  return <span aria-hidden className="hidden h-px flex-1 bg-white/[0.09] md:block" />;
}

/**
 * Four corner ticks around the mark, the same registration language the panels
 * use. The mark keeps its own clear space inside them: brackets tight to the
 * artwork read as a box someone forgot to finish rather than as a sight.
 */
function BracketBox() {
  const arm = "absolute size-[7px] border-bone/30";
  return (
    <span aria-hidden className="absolute inset-0">
      <span className={cn(arm, "top-0 left-0 border-t border-l")} />
      <span className={cn(arm, "top-0 right-0 border-t border-r")} />
      <span className={cn(arm, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(arm, "right-0 bottom-0 border-r border-b")} />
    </span>
  );
}

