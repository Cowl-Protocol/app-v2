import { CircuitBackdrop } from "@/components/layout/circuit-backdrop";
import { LoginCard } from "./login-card";

/**
 * The door, and the frame it sits in.
 *
 * This was `app/login/page.tsx` until the whole flow moved to one route. It is a
 * screen rather than a page now, which is the only difference: it is shown by
 * the gate when there is no session instead of being reached by typing a path.
 *
 * It holds no state of its own. Sign in touches Google, Turnkey and the key
 * derivation, so what is in flight and what went wrong belong to the gate that
 * started it, and this passes both through.
 */
export function LoginScreen({
  onGoogle,
  pending,
  error,
}: {
  onGoogle: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <CircuitBackdrop className="text-white" />
      <div className="relative flex w-full justify-center">
        <LoginCard onGoogle={onGoogle} pending={pending} error={error} />
      </div>
    </main>
  );
}
