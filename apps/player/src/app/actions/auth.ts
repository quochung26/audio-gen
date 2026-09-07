"use server";

import { AuthError } from "next-auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@audio/core";
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

  if (!email.includes("@") || email.length < 5) return { error: "That email is not valid" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  // Signing up also costs one hash, so it needs the same rate limit.
  if (!checkRateLimit(`register:${email}`).allowed) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const existing = await prismaPlayer.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Could not create an account with this email. If you already have one, sign in." };
  }

  await prismaPlayer.user.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password) },
  });

  await signIn("credentials", { email, password, redirectTo: "/" });
  return {};
}

export async function loginWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    // `signIn` redirects by THROWING a special error — catching everything would block the
    // success path too. Only real authentication errors are handled.
    if (err instanceof AuthError) {
      return { error: "Wrong email or password." };
    }
    throw err;
  }
}

export async function loginWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
