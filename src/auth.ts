import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { isAllowedEmail, optionalEnv } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { clearFailures, isBlocked, recordFailure } from "@/lib/login-throttle";

class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

// Private app: one account (ALLOWED_EMAIL + ADMIN_PASSWORD_HASH). There is no sign-up.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        if (await isBlocked(request)) throw new TooManyAttempts();

        const email = typeof credentials.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        const hash = optionalEnv("ADMIN_PASSWORD_HASH");

        // Always run the hash so a wrong email and a wrong password take the same time.
        const passwordOk = !!hash && password.length > 0 && password.length <= 256 && verifyPassword(password, hash);
        if (!passwordOk || !isAllowedEmail(email)) {
          await recordFailure(request);
          await new Promise((r) => setTimeout(r, 800));
          return null;
        }

        await clearFailures(request);
        return { id: "owner", email: email.toLowerCase(), name: "Owner" };
      },
    }),
  ],
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
});
