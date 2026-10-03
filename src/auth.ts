import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { checkPassword } from "@/lib/users";
import { clearFailures, isBlocked, recordFailure } from "@/lib/login-throttle";

class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

// Email + password login. Only the owner (ALLOWED_EMAIL) and the people the owner
// adds in Settings can log in. There is no public sign-up.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        if (await isBlocked(request)) throw new TooManyAttempts();

        const email = typeof credentials.email === "string" ? credentials.email : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        const ok = password.length > 0 && password.length <= 256 ? await checkPassword(email, password) : null;
        if (!ok) {
          await recordFailure(request);
          await new Promise((r) => setTimeout(r, 800));
          return null;
        }

        await clearFailures(request);
        return { id: ok, email: ok };
      },
    }),
  ],
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
});
