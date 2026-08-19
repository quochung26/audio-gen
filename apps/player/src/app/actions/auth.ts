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
 * Đăng ký bằng email + mật khẩu.
 *
 * KHÔNG tiết lộ email đã tồn tại hay chưa qua thông báo khác nhau — làm vậy là
 * cho người ngoài dò danh sách người dùng. Trùng email thì báo chung chung và
 * gợi ý đăng nhập.
 */
export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email.includes("@") || email.length < 5) return { error: "Email không hợp lệ" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên` };
  }
  // Đăng ký cũng tốn một lần băm, nên cũng phải giới hạn.
  if (!checkRateLimit(`register:${email}`).allowed) {
    return { error: "Thử quá nhiều lần. Đợi ít phút rồi thử lại." };
  }

  const existing = await prismaPlayer.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Không tạo được tài khoản với email này. Nếu đã có, hãy đăng nhập." };
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
    // `signIn` chuyển hướng bằng cách NÉM một lỗi đặc biệt — bắt hết là chặn
    // luôn đường thành công. Chỉ xử lý lỗi xác thực thật.
    if (err instanceof AuthError) {
      return { error: "Email hoặc mật khẩu không đúng." };
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
