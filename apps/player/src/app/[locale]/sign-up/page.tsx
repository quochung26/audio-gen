import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { register } from "@/app/actions/auth";
import { AuthForm, AuthInput } from "@/components/AuthForm";
import { dict, localeAlternates, localeHref, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return {
    title: dict((await params).locale as Locale).signUp,
    alternates: localeAlternates("/sign-up"),
  };
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = dict(locale);
  if (await auth()) redirect(localeHref(locale, "/"));

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">{t.signUp}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {t.signUpBlurb}
        </p>
      </div>

      <AuthForm action={register} submit={t.createAccount}>
        <AuthInput name="name" label={t.displayNameOptional} autoComplete="nickname" />
        <AuthInput name="email" label="Email" type="email" autoComplete="email" required />
        <AuthInput
          name="password"
          label={t.passwordWithHint}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </AuthForm>

      <p className="text-sm text-neutral-500">
        {t.haveAccount}{" "}
        <Link href={localeHref(locale, "/sign-in")} className="underline">
          {t.signIn}
        </Link>
      </p>
    </div>
  );
}
