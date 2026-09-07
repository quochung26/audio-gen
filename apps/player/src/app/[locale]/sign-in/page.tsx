import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, GOOGLE_ENABLED } from "@/auth";
import { loginWithGoogle, loginWithPassword } from "@/app/actions/auth";
import { AuthForm, AuthInput } from "@/components/AuthForm";
import { dict, localeAlternates, localeHref, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return {
    title: dict((await params).locale as Locale).signIn,
    alternates: localeAlternates("/sign-in"),
  };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = dict(locale);
  if (await auth()) redirect(localeHref(locale, "/"));

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">{t.signIn}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {t.signInBlurb}
        </p>
        <p className="mt-2 text-xs text-neutral-600">
          {t.signInOptional}
        </p>
      </div>

      {GOOGLE_ENABLED && (
        <>
          <form action={loginWithGoogle}>
            <button
              type="submit"
              className="w-full rounded border border-neutral-700 px-4 py-2.5 text-sm hover:bg-neutral-900"
            >
              {t.signInWithGoogle}
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <span className="h-px flex-1 bg-neutral-900" />
            {t.or}
            <span className="h-px flex-1 bg-neutral-900" />
          </div>
        </>
      )}

      <AuthForm action={loginWithPassword} submit={t.signIn}>
        <AuthInput name="email" label="Email" type="email" autoComplete="email" required />
        <AuthInput
          name="password"
          label={t.password}
          type="password"
          autoComplete="current-password"
          required
        />
      </AuthForm>

      <p className="text-sm text-neutral-500">
        {t.noAccountYet}{" "}
        <Link href={localeHref(locale, "/sign-up")} className="underline">
          {t.signUp}
        </Link>
      </p>
    </div>
  );
}
