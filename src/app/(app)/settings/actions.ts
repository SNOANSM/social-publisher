"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { deleteInstagramTokens, deleteYouTubeTokens, forceRefreshYouTube, refreshInstagramIfNeeded } from "@/lib/tokens";
import { PublishError } from "@/lib/errors";
import { addUser, changePassword, checkPassword, getUser, isOwner, isValidEmail, normalizeEmail, removeUser } from "@/lib/users";

async function guard() {
  if (!(await currentUser())) redirect("/login");
}

export async function disconnect(formData: FormData) {
  await guard();
  const platform = formData.get("platform");
  if (platform === "youtube") await deleteYouTubeTokens();
  if (platform === "instagram") await deleteInstagramTokens();
  revalidatePath("/settings");
  redirect(`/settings?disconnected=${platform}`);
}

export async function refreshNow(formData: FormData) {
  await guard();
  const platform = formData.get("platform");
  let target = "/settings?refreshed=1";
  try {
    if (platform === "youtube") await forceRefreshYouTube();
    if (platform === "instagram") await refreshInstagramIfNeeded(true);
  } catch (err) {
    const message = err instanceof PublishError ? err.userMessage : "فشل تجديد الصلاحية.";
    target = `/settings?error=${encodeURIComponent(message)}`;
  }
  revalidatePath("/settings");
  redirect(target);
}

/* ------------------------------- Users ------------------------------- */

const back = (params: Record<string, string>) => redirect(`/settings?${new URLSearchParams(params)}#users`);

export async function addUserAction(formData: FormData) {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!me.isOwner) back({ error: "بس صاحب الحساب يقدر يضيف أشخاص." });

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").slice(0, 60);
  const password = String(formData.get("password") ?? "");
  if (!isValidEmail(email)) back({ error: "الإيميل غير صحيح." });
  if (isOwner(email) || (await getUser(email))) back({ error: "هذا الإيميل موجود." });
  if (password.length < 10) back({ error: "كلمة المرور لازم تكون 10 أحرف أو أكثر." });
  if (password !== String(formData.get("confirm") ?? "")) back({ error: "كلمتين المرور مو متطابقة." });

  await addUser(email, name, password, me.email);
  revalidatePath("/settings");
  back({ ok: `تمت إضافة ${email} ✅ يقدر يدخل الحين بالإيميل وكلمة المرور.` });
}

export async function removeUserAction(formData: FormData) {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!me.isOwner) back({ error: "بس صاحب الحساب يقدر يشيل أشخاص." });
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  await removeUser(email);
  revalidatePath("/settings");
  back({ ok: `تم حذف ${email}. ما يقدر يدخل بعد الحين.` });
}

export async function changePasswordAction(formData: FormData) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (!(await checkPassword(me.email, current))) back({ error: "كلمة المرور الحالية غلط." });
  if (next.length < 10) back({ error: "كلمة المرور الجديدة لازم تكون 10 أحرف أو أكثر." });
  if (next !== String(formData.get("confirm") ?? "")) back({ error: "كلمتين المرور الجديدة مو متطابقة." });
  await changePassword(me.email, next);
  back({ ok: "تم تغيير كلمة المرور ✅" });
}
