import { dataStore } from "./stores";
import { randomId } from "./crypto";
import type { Platform } from "./types";

// Content plan: ideas with an optional day, kept in Blobs (plan/<id>).
export type PlanStatus = "idea" | "ready" | "done";
export type PlanFormat = "reel" | "post" | "carousel" | "video" | "short" | "story";

export interface PlanItem {
  id: string;
  title: string;
  notes: string;
  date?: string; // local day "YYYY-MM-DD"
  time?: string; // "HH:mm"
  platforms: Platform[];
  format: PlanFormat;
  status: PlanStatus;
  postId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const PLAN_FORMATS: PlanFormat[] = ["reel", "post", "carousel", "video", "short", "story"];
const key = (id: string) => `plan/${id}`;

export function isValidPlanId(id: string) {
  return /^[A-Za-z0-9_-]{8,40}$/.test(id);
}

export function sanitizePlanInput(input: Record<string, unknown>): Partial<PlanItem> | string {
  const out: Partial<PlanItem> = {};
  if ("title" in input) {
    const title = String(input.title ?? "").trim().slice(0, 200);
    if (!title) return "اكتب عنوان الفكرة.";
    out.title = title;
  }
  if ("notes" in input) out.notes = String(input.notes ?? "").slice(0, 4000);
  if ("date" in input) {
    const d = String(input.date ?? "");
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "التاريخ غير صحيح.";
    out.date = d || undefined;
  }
  if ("time" in input) {
    const t = String(input.time ?? "");
    if (t && !/^\d{2}:\d{2}$/.test(t)) return "الوقت غير صحيح.";
    out.time = t || undefined;
  }
  if ("platforms" in input) {
    out.platforms = (Array.isArray(input.platforms) ? input.platforms : []).filter(
      (p): p is Platform => p === "instagram" || p === "youtube",
    );
  }
  if ("format" in input) out.format = PLAN_FORMATS.includes(input.format as PlanFormat) ? (input.format as PlanFormat) : "reel";
  if ("status" in input) {
    const s = input.status as PlanStatus;
    out.status = s === "ready" || s === "done" ? s : "idea";
  }
  return out;
}

export async function listPlan(): Promise<PlanItem[]> {
  const store = dataStore();
  const { blobs } = await store.list({ prefix: "plan/" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }) as Promise<PlanItem | null>));
  return items.filter((i): i is PlanItem => !!i);
}

export async function getPlanItem(id: string): Promise<PlanItem | null> {
  if (!isValidPlanId(id)) return null;
  return (await dataStore().get(key(id), { type: "json" })) as PlanItem | null;
}

export async function createPlanItem(data: Partial<PlanItem>, createdBy: string): Promise<PlanItem> {
  const now = new Date().toISOString();
  const item: PlanItem = {
    id: randomId(12),
    title: data.title ?? "",
    notes: data.notes ?? "",
    date: data.date,
    time: data.time,
    platforms: data.platforms ?? ["instagram"],
    format: data.format ?? "reel",
    status: data.status ?? "idea",
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await dataStore().setJSON(key(item.id), item);
  return item;
}

export async function updatePlanItem(id: string, data: Partial<PlanItem>): Promise<PlanItem | null> {
  const current = await getPlanItem(id);
  if (!current) return null;
  const updated: PlanItem = { ...current, ...data, id, updatedAt: new Date().toISOString() };
  await dataStore().setJSON(key(id), updated);
  return updated;
}

export async function deletePlanItem(id: string): Promise<void> {
  if (isValidPlanId(id)) await dataStore().delete(key(id));
}
