import { requirePageUser } from "@/lib/session";
import { getConnectionStatus } from "@/lib/tokens";
import { formatDate } from "@/lib/format";
import { PlatformIcon } from "@/components/PlatformIcon";
import { cookies } from "next/headers";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { listUsers } from "@/lib/users";
import { addUserAction, changePasswordAction, disconnect, refreshNow, removeUserAction } from "./actions";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL = { youtube: "يوتيوب", instagram: "انستقرام" } as const;
const INPUT = "w-full rounded-xl border border-line bg-field px-3 py-2.5 text-sm outline-none focus:border-accent";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requirePageUser();
  const status = await getConnectionStatus();
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const connected = typeof sp.connected === "string" ? sp.connected : null;
  const disconnected = typeof sp.disconnected === "string" ? sp.disconnected : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const users = user.isOwner ? await listUsers() : [];

  const igDaysLeft = status.instagram.expiresInDays ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted">اربط حساباتك مرة وحدة، والتوكنات تنحفظ مشفّرة في السيرفر وتتجدد تلقائياً.</p>
      </div>

      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      {ok && <p className="rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">{ok}</p>}
      {connected && connected in PLATFORM_LABEL && (
        <p className="rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">تم ربط {PLATFORM_LABEL[connected as keyof typeof PLATFORM_LABEL]} بنجاح ✅</p>
      )}
      {disconnected && disconnected in PLATFORM_LABEL && (
        <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted ring-1 ring-line">
          تم فصل {PLATFORM_LABEL[disconnected as keyof typeof PLATFORM_LABEL]}.
        </p>
      )}

      <section className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        <AccountRow
          platform="youtube"
          connected={status.youtube.connected}
          title="YouTube"
          subtitle={status.youtube.connected ? `القناة: ${status.youtube.name}` : "اربط قناتك عشان ترفع الفيديوهات عليها."}
          meta={status.youtube.connectedAt ? `مربوط من ${formatDate(status.youtube.connectedAt)}` : undefined}
          warning={status.youtube.warning}
        />
        <AccountRow
          platform="instagram"
          connected={status.instagram.connected}
          title="Instagram"
          subtitle={
            status.instagram.connected
              ? (
                <>
                  الحساب: <span className="ltr">@{status.instagram.name}</span> · الصفحة: {status.instagram.pageName}
                </>
              )
              : "حساب Business أو Creator مربوط بصفحة فيسبوك."
          }
          meta={
            status.instagram.connected
              ? igDaysLeft !== null
                ? `الصلاحية تنتهي بعد ${igDaysLeft} يوم (تتجدد تلقائياً)`
                : "الصلاحية ما لها تاريخ انتهاء"
              : undefined
          }
          warning={status.instagram.warning ?? (igDaysLeft !== null && igDaysLeft < 10 ? "الصلاحية قربت تنتهي. أعد الربط عشان تتجدد." : undefined)}
        />
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <h2 className="font-semibold">المظهر</h2>
          <p className="mt-0.5 text-sm text-muted">«تلقائي» يمشي حسب إعداد جوالك.</p>
        </div>
        <ThemeSwitcher initial={theme} />
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <h2 className="font-semibold">كلمة المرور</h2>
          <p className="mt-0.5 text-sm text-muted">
            مسجّل الدخول بـ <span className="ltr font-medium text-ink">{user.email}</span>
            {user.isOwner && " (صاحب الحساب)"}
          </p>
        </div>
        <form action={changePasswordAction} className="grid gap-2 sm:grid-cols-3">
          <input name="current" type="password" required autoComplete="current-password" placeholder="الحالية" className={INPUT} />
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="الجديدة (10+)" className={INPUT} />
          <input name="confirm" type="password" required minLength={10} autoComplete="new-password" placeholder="أعد الجديدة" className={INPUT} />
          <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-on-ink sm:col-span-3">تغيير كلمة المرور</button>
        </form>
      </section>

      {user.isOwner && (
        <section id="users" className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <div>
            <h2 className="font-semibold">الأشخاص اللي يقدرون يدخلون</h2>
            <p className="mt-0.5 text-sm text-muted">يشوفون نفس الحسابات المربوطة والمنشورات والخطة، ويقدرون ينشرون. ما يقدرون يضيفون أحد.</p>
          </div>

          <ul className="divide-y divide-line rounded-xl border border-line">
            <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="ltr truncate">{user.email}</span>
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">صاحب الحساب</span>
            </li>
            {users.map((u) => (
              <li key={u.email} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  {u.name && <p className="font-medium">{u.name}</p>}
                  <p className="ltr truncate text-muted">{u.email}</p>
                  <p className="text-xs text-muted">أُضيف {formatDate(u.createdAt)}</p>
                </div>
                <form action={removeUserAction}>
                  <input type="hidden" name="email" value={u.email} />
                  <button className="rounded-lg border border-line px-3 py-1.5 text-xs text-danger hover:bg-danger-soft">حذف</button>
                </form>
              </li>
            ))}
          </ul>

          <form action={addUserAction} className="grid gap-2 sm:grid-cols-2">
            <input name="name" placeholder="الاسم (اختياري)" maxLength={60} className={INPUT} />
            <input name="email" type="email" required placeholder="الإيميل" dir="ltr" className={INPUT} />
            <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="كلمة مرور له (10+)" className={INPUT} />
            <input name="confirm" type="password" required minLength={10} autoComplete="new-password" placeholder="أعد كلمة المرور" className={INPUT} />
            <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-on-ink sm:col-span-2">+ إضافة شخص</button>
          </form>
          <p className="text-xs text-muted">عطه الإيميل وكلمة المرور، ويقدر يغيّر كلمة المرور بنفسه من هنا بعد ما يدخل.</p>
        </section>
      )}
    </div>
  );
}

function AccountRow(props: {
  platform: "youtube" | "instagram";
  connected: boolean;
  title: string;
  subtitle: React.ReactNode;
  meta?: string;
  warning?: string;
}) {
  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={props.platform} className="mt-0.5 size-10" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{props.title}</h2>
            {props.connected ? (
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">مربوط ✅</span>
            ) : (
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">غير مربوط ❌</span>
            )}
          </div>
          <p className="mt-0.5 break-words text-sm text-muted">{props.subtitle}</p>
          {props.meta && <p className="mt-0.5 text-xs text-muted">{props.meta}</p>}
          {props.warning && <p className="mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn">⚠️ {props.warning}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <a
          href={`/api/connect/${props.platform}`}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-on-ink transition hover:bg-ink/85"
        >
          {props.connected ? "إعادة الربط" : `ربط ${props.title}`}
        </a>
        {props.connected && (
          <>
            <form action={refreshNow}>
              <input type="hidden" name="platform" value={props.platform} />
              <button className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-canvas">تجديد الآن</button>
            </form>
            <form action={disconnect}>
              <input type="hidden" name="platform" value={props.platform} />
              <button className="rounded-xl border border-line px-3 py-2 text-sm text-danger hover:bg-danger-soft">فصل</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
