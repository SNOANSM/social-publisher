"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { deleteInstagramTokens, deleteYouTubeTokens, forceRefreshYouTube, refreshInstagramIfNeeded } from "@/lib/tokens";
import { PublishError } from "@/lib/errors";

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
