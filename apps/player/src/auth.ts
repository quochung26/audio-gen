import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifyPassword } from "@audio/core";
import { prismaPlayer } from "@audio/database";
import { checkRateLimit, clearRateLimit } from "@/lib/auth-rate-limit";

/**
 * Sign-in for the player.
 *
 * Two ways in:
 * - Google — holds no password at all, the lowest risk. Needs AUTH_GOOGLE_ID and
 *   AUTH_GOOGLE_SECRET; without them the Google button hides itself rather than raising a
 *   confusing error.
 * - Password — self-contained, works immediately with no external service.
 *
 * Sessions are JWTs rather than a Session table: Auth.js's Credentials provider cannot use
 * database sessions. The adapter is still needed to link a Google account to the User table.
 *
 * ⚠️ next-auth v5 is still labelled beta. It is the only version supporting the App Router.
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
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = String(raw?.email ?? "").trim().toLowerCase();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;

        // Blocked BEFORE hashing: each check costs ~270 ms and ~64 MB, and sending them in a
        // stream would bring the server down without guessing anything.
        if (!checkRateLimit(email).allowed) return null;

        const user = await prismaPlayer.user.findUnique({ where: { email } });

        // Does not distinguish "no such email" from "wrong password": distinguishing them
        // lets an outsider probe who has registered.
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
 * An explicit type annotation for `auth`.
 *
 * Without it tsc reports TS2742: the inferred type points inside node_modules at a path it
 * cannot name "portably". A known problem with next-auth v5 beta under pnpm.
 */
export const auth: NextAuthResult["auth"] = nextAuth.auth;

/** Whether the Google button shows — used on the sign-in page. */
export const GOOGLE_ENABLED = googleConfigured;
