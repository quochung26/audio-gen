import Link from "next/link";
import { auth } from "@/auth";
import { logout } from "@/app/actions/auth";
import { dict, localeHref, type Locale } from "@/lib/i18n";

/**
 * The account corner.
 *
 * Signed out it shows only a small link — signing in is OPTIONAL, not a gate. Anyone who
 * does not want an account can still listen to everything.
 */
export async function AccountMenu({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const session = await auth();

  if (!session?.user) {
    return (
      <Link href={localeHref(locale, "/sign-in")} className="text-sm text-neutral-400 hover:text-neutral-100">
        {t.signIn}
      </Link>
    );
  }

  const label = session.user.name || session.user.email || t.account;

  return (
    <div className="flex items-center gap-3">
      <Link href={localeHref(locale, "/favourites")} className="text-sm text-neutral-400 hover:text-neutral-100">
        {t.favourites}
      </Link>
      <span className="max-w-24 truncate text-sm text-neutral-500">{label}</span>
      <form action={logout}>
        <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-200">
          {t.signOut}
        </button>
      </form>
    </div>
  );
}
