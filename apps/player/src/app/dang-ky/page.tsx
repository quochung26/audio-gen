import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { register } from "@/app/actions/auth";
import { AuthForm, AuthInput } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign up" };

export default async function RegisterPage() {
  if (await auth()) redirect("/");

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">Sign up</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Just an email and a password. Nothing else to verify.
        </p>
      </div>

      <AuthForm action={register} submit="Create account">
        <AuthInput name="name" label="Display name (optional)" autoComplete="nickname" />
        <AuthInput name="email" label="Email" type="email" autoComplete="email" required />
        <AuthInput
          name="password"
          label="Password — at least 8 characters"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </AuthForm>

      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/dang-nhap" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
