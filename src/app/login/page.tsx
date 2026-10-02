import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { currentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  AccessDenied: "هذا الحساب غير مسموح له بالدخول.",
  Configuration: "في مشكلة في إعدادات تسجيل الدخول. راجع متغيرات البيئة.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "تعذّر تسجيل الدخول. جرّب مرة ثانية.") : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-ink text-xl font-bold text-white">ن</div>
        <h1 className="text-xl font-bold">ناشر</h1>
        <p className="mt-1 text-sm text-muted">لوحة نشر خاصة. الدخول لصاحبها فقط.</p>

        {message && <p className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 font-medium transition hover:bg-canvas">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
              <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2.1H12v4h6a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.9z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.2H2.1a11 11 0 0 0 0 9.6L5.7 14z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2L5.7 10C6.6 7.4 9.1 5.4 12 5.4z" />
            </svg>
            تسجيل الدخول بحساب Google
          </button>
        </form>
      </div>
    </main>
  );
}
