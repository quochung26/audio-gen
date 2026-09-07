"use server";

import { AuthError } from "next-auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@audio/core";
import { dict, localeHref } from "@/lib/i18n";
import { currentLocale } from "@/lib/request-locale";
import { prismaPlayer } from "@audio/database";
import { signIn, signOut } from "@/auth";
import { checkRateLimit } from "@/lib/auth-rate-limit";

export interface AuthState {
  error?: string;
}

/**
 * Sign up with email + password.
 *
 * Does NOT reveal whether an email already exists through a different message — doing so
 * lets an outsider enumerate the user list. A duplicate gets a generic message suggesting
 * signing in.
 */
export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const locale = await currentLocale();
  const t = dict(locale);
  if (!email.includes("@") || email.length < 5) return { error: t.errEmailInvalid };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: t.errPasswordTooShort(MIN_PASSWORD_LENGTH) };
  }
  // Signing up also costs one hash, so it needs the same rate limit.
  if (!checkRateLimit(`register:${email}`).allowed) {
    return { error: t.errTooManyAttempts };
  }

  const existing = await prismaPlayer.user.findUnique({ where: { email } });
  if (existing) {
    return { error: t.errCannotCreateAccount };
  }

  await prismaPlayer.user.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password) },
  });

  await signIn("credentials", { email, password, redirectTo: localeHref(locale, "/") });
  return {};
}

export async function loginWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // Read before the try: `signIn` signals success by THROWING a redirect, so anything
  // computed inside would be skipped on the path that matters.
  const locale = await currentLocale();
  const t = dict(locale);

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: localeHref(locale, "/"),
    });
    return {};
  } catch (err) {
    // `signIn` redirects by THROWING a special error — catching everything would block the
    // success path too. Only real authentication errors are handled.
    if (err instanceof AuthError) {
      return { error: t.errWrongCredentials };
    }
    throw err;
  }
}

export async function loginWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: localeHref(await currentLocale(), "/") });
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: localeHref(await currentLocale(), "/") });
}
