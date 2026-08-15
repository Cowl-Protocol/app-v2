import { Eyes } from "@/components/brand/eyes";
import { Alert } from "@/components/ui/alert";
import { AUTH_CONFIGURED } from "@/config";

/**
 * The login card.
 *
 * **Google is wired. Nothing else on this card is.** Pressing Continue with
 * Google runs the real sequence in `lib/sign-in.ts` and ends with a shielded
 * account derived in this tab. The email and password controls are the reference
 * mock's, they have nothing to submit to, and they are rendered inert rather
 * than left looking live: a field that accepts typing and a button that does
 * nothing reads as a broken login, which is worse than an unfinished one.
 *
 * **The password field is still slated for removal**, and it is worth keeping
 * the reason written down because the field looks like an oversight otherwise.
 * This product has no password. The intended email path is a one time code, so
 * when it is built this card becomes two screens, request a code and then enter
 * it, and the password input has nowhere to go in either. It is here because the
 * mock has it and the user overruled leaving it out on 2026-08-03.
 *
 * **Two ways in, and that is the whole list.** Apple and X were in the mock and
 * are deliberately gone: every provider is an integration to build, a consent
 * screen to keep alive, and another account someone can lose. Connect wallet is
 * out too, for now. It is cheap to add later, because the shielded account comes
 * from a signature and any wallet can produce one, but it is expensive to remove
 * once somebody has an account behind it.
 *
 * The primary button is blue, which is not in the palette in `cowl/STYLE.md`.
 * That is the mock's call and it sits behind `--color-primary` in globals.css so
 * the whole app moves by editing one line once somebody decides.
 *
 * There is deliberately no `<form>` element. A form with no submit handler
 * reloads the page on Enter, which reads as a broken login rather than as an
 * unfinished one. The form tag and its handler arrive with the email path.
 */

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.82-.07-1.6-.21-2.36H12v4.47h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.57-5.15 3.57-8.73Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.35v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.34 14.31a7.19 7.19 0 0 1 0-4.6V6.62H1.35a12 12 0 0 0 0 10.78l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.35 6.62l3.99 3.09A7.15 7.15 0 0 1 12 4.75Z"
      />
    </svg>
  );
}

/**
 * The spinner on the Google button while a popup is open.
 *
 * It replaces the mark rather than joining it, so the button's width does not
 * change under the pointer at the moment it is pressed.
 */
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoginCard({
  onGoogle,
  pending,
  error,
}: {
  onGoogle: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className="relative w-full max-w-[404px] rounded-2xl bg-card/95 p-7 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] backdrop-blur-sm">
      {/* the mark, flanked by the faint dot field */}
      <div className="flex items-center justify-center gap-4">
        <DotField />
        <div className="grid size-[50px] shrink-0 place-items-center rounded-[15px] bg-ink2 ring-1 ring-white/[0.07]">
          <Eyes className="w-7 text-mark" />
        </div>
        <DotField flip />
      </div>

      <h1 className="mt-5 text-center text-[26px] font-semibold tracking-tight text-bone">
        Welcome Back
      </h1>
      {/*
        Not a link, and not a missing screen either. Continuing with Google
        creates the account if there is none, so there is no separate sign up to
        point at. `href="#"` was worse than either: it looked live and scrolled
        to the top, and the app bar already states the house rule that a dead
        link is worse than an obviously unfinished one.
      */}
      <p className="mt-1.5 text-center text-[13px] text-bone/45">
        New here? Continue with Google and your account is made for you.
      </p>

      {/*
        **One door, and the card now says so by having only one.** The disabled
        email and password block that used to sit here was carried through two
        providers as a shape the mock had, and it was always due to come out when
        auth was wired · it is out on the user's call. A field the product has no
        concept of teaches the wrong thing about how the account works even
        greyed out, and "Email sign in is not open yet" advertised a second door
        that must never open: a second login method is a second and weaker way
        into the same shielded account, and the weakest one sets the strength of
        all of them.

        Full width and labelled, rather than an icon in a row of providers. With
        Google the only provider, a lone icon in a grid reads as buttons that
        failed to render, and an unlabelled mark asks the visitor to recognise a
        logo before they can act.
      */}
      <div className="mt-7" />
      <button
        type="button"
        onClick={onGoogle}
        disabled={pending || !AUTH_CONFIGURED}
        aria-busy={pending}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-ink2 text-[14px] font-medium text-bone/85 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.07] hover:text-bone disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? <Spinner /> : <GoogleMark />}
        {pending ? "Waiting for Google" : "Continue with Google"}
      </button>

      {/*
        Two failure notes, deliberately different. The first is a build that was
        never given its ids, which no visitor can fix and which should never
        reach one; saying so plainly beats a button that fails at Google's door
        with a screen nobody can read. The second is this attempt, and it clears
        on the next one.
      */}
      {!AUTH_CONFIGURED && (
        <p className="mt-3 text-center text-[12px] text-bone/40">
          This build has no sign in credentials, so Google is unavailable here.
        </p>
      )}

      {/*
        This used to be brighter bone on the argument that the app has no alarm
        colour and did not need one, because the message was the only thing that
        moved on the card. That argument was made when the only failure was a
        build with no credentials, which no visitor could act on anyway. Sign in
        now fails in ways a person is expected to do something about, and the
        user's call on 2026-08-10 is that those read as refusals first. See
        `--color-danger` in globals.css, which is where the reversal is undone if
        it is ever undone.
      */}
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  );
}

/**
 * An input row. The icon sits inside the same rounded well as the field so the
 * pair reads as one control, and the whole row is a label, so a tap anywhere
 * along it lands in the input instead of only on the text.
 */
/**
 * The faint dot field either side of the mark. Texture, nothing more.
 *
 * It fades toward the mark rather than away from it, so the eye is pulled inward
 * to the centre. `flip` mirrors the gradient for the right hand copy.
 */
function DotField({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 76 26"
      aria-hidden
      className={`h-[26px] w-[76px] shrink-0 text-white ${flip ? "-scale-x-100" : ""}`}
    >
      <g fill="currentColor">
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 8 }).map((__, col) => (
            <circle
              key={`${row}-${col}`}
              cx={3 + col * 10}
              cy={4 + row * 9}
              r="1.3"
              fillOpacity={0.04 + col * 0.03}
            />
          )),
        )}
      </g>
    </svg>
  );
}
