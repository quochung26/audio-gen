import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, GOOGLE_ENABLED } from "@/auth";
import { loginWithGoogle, loginWithPassword } from "@/app/actions/auth";
import { AuthForm, AuthInput } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await auth()) redirect("/");

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Sign in to sync your listening position across devices and save favourites.
        </p>
        <p className="mt-2 text-xs text-neutral-600">
          You can listen perfectly well without signing in — the position is kept on this device.
        </p>
      </div>

      {GOOGLE_ENABLED && (
        <>
          <form action={loginWithGoogle}>
            <button
              type="submit"
              className="w-full rounded border border-neutral-700 px-4 py-2.5 text-sm hover:bg-neutral-900"
            >
              Sign in with Google
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <span className="h-px flex-1 bg-neutral-900" />
            or
            <span className="h-px flex-1 bg-neutral-900" />
          </div>
        </>
      )}

      <AuthForm action={loginWithPassword} submit="Sign in">
        <AuthInput name="email" label="Email" type="email" autoComplete="email" required />
        <AuthInput
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
        />
      </AuthForm>

      <p className="text-sm text-neutral-500">
        No account yet?{" "}
        <Link href="/dang-ky" className="underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
