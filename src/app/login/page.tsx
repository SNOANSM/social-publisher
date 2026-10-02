import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { currentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  invalid: "الإيميل أو كلمة المرور غير صحيحة.",
  too_many_attempts: "محاولات كثيرة غلط. انتظر ربع ساعة وجرّب مرة ثانية.",
  Configuration: "في مشكلة في إعدادات تسجيل الدخول. راجع متغيرات البيئة.",
};

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const code = err.type === "CredentialsSignin" ? ((err as AuthError & { code?: string }).code ?? "") : err.type;
      redirect(`/login?error=${code === "too_many_attempts" ? "too_many_attempts" : code === "Configuration" ? "Configuration" : "invalid"}`);
    }
    throw err; // Next.js redirect after a successful sign-in
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/");
  const { error, code } = await searchParams;
  const key = code === "too_many_attempts" ? code : error;
  const message = typeof key === "string" ? (ERRORS[key] ?? ERRORS.invalid) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-ink text-xl font-bold text-white">ن</div>
          <h1 className="text-xl font-bold">ناشر</h1>
          <p className="mt-1 text-sm text-muted">لوحة نشر خاصة. الدخول لصاحبها فقط.</p>
        </div>

        {message && <p className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>}

        <form action={login} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">الإيميل</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              dir="ltr"
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">كلمة المرور</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>
          <button className="w-full rounded-xl bg-ink px-4 py-3 font-medium text-white transition hover:bg-ink/85">دخول</button>
        </form>
      </div>
    </main>
  );
}
