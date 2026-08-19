import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifyPassword } from "@audio/core";
import { prismaPlayer } from "@audio/database";
import { checkRateLimit, clearRateLimit } from "@/lib/auth-rate-limit";

/**
 * Đăng nhập cho trang nghe.
 *
 * Hai đường vào:
 * - Google — không giữ mật khẩu nào, rủi ro thấp nhất. Cần AUTH_GOOGLE_ID và
 *   AUTH_GOOGLE_SECRET; thiếu thì nút Google tự ẩn chứ không báo lỗi khó hiểu.
 * - Mật khẩu — tự chứa, chạy được ngay không cần dịch vụ ngoài.
 *
 * Phiên lưu bằng JWT chứ không phải bảng Session: provider Credentials của
 * Auth.js không dùng được phiên trong DB. Adapter vẫn cần để nối tài khoản
 * Google vào bảng User.
 *
 * ⚠️ next-auth v5 còn mang nhãn beta. Đây là bản duy nhất hỗ trợ App Router.
 */
const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const nextAuth = NextAuth({
  adapter: PrismaAdapter(prismaPlayer),
  session: { strategy: "jwt" },
  pages: { signIn: "/dang-nhap" },

  providers: [
    ...(googleConfigured ? [Google] : []),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(raw) {
        const email = String(raw?.email ?? "").trim().toLowerCase();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;

        // Chặn TRƯỚC khi băm: mỗi lần kiểm tốn ~270 ms và ~64 MB, gửi liên tục
        // là làm sập máy chủ dù chẳng đoán đúng gì.
        if (!checkRateLimit(email).allowed) return null;

        const user = await prismaPlayer.user.findUnique({ where: { email } });

        // Không phân biệt "không có email này" với "sai mật khẩu": phân biệt
        // là cho người ngoài dò xem ai đã đăng ký.
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;

        clearRateLimit(email);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export const handlers = nextAuth.handlers;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;

/**
 * Chú kiểu tường minh cho `auth`.
 *
 * Không có nó thì tsc báo TS2742: kiểu suy ra trỏ vào đường dẫn bên trong
 * node_modules mà nó không đặt tên "mang đi được". Lỗi cố hữu của next-auth v5
 * beta với pnpm.
 */
export const auth: NextAuthResult["auth"] = nextAuth.auth;

/** Nút Google có hiện không — dùng ở trang đăng nhập. */
export const GOOGLE_ENABLED = googleConfigured;
