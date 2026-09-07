import Link from "next/link";
import { auth } from "@/auth";
import { logout } from "@/app/actions/auth";

/**
 * The account corner.
 *
 * Signed out it shows only a small link — signing in is OPTIONAL, not a gate. Anyone who
 * does not want an account can still listen to everything.
 */
export async function AccountMenu() {
  const session = await auth();

  if (!session?.user) {
    return (
      <Link href="/dang-nhap" className="text-sm text-neutral-400 hover:text-neutral-100">
        Sign in
      </Link>
    );
  }

  const label = session.user.name || session.user.email || "Account";

  return (
    <div className="flex items-center gap-3">
      <Link href="/yeu-thich" className="text-sm text-neutral-400 hover:text-neutral-100">
        Favourites
      </Link>
      <span className="max-w-24 truncate text-sm text-neutral-500">{label}</span>
      <form action={logout}>
        <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-200">
          Sign out
        </button>
      </form>
    </div>
  );
}
