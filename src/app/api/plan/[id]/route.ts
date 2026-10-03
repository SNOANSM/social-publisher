import { NextResponse } from "next/server";
import { apiUser, jsonError } from "@/lib/session";
import { deletePlanItem, sanitizePlanInput, updatePlanItem } from "@/lib/plan";

export async function PATCH(req: Request, ctx: RouteContext<"/api/plan/[id]">) {
  const { denied } = await apiUser();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("الطلب غير صالح.");
  const data = sanitizePlanInput(body);
  if (typeof data === "string") return jsonError(data);
  const item = await updatePlanItem(id, data);
  return item ? NextResponse.json({ item }) : jsonError("الفكرة غير موجودة.", 404);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plan/[id]">) {
  const { denied } = await apiUser();
  if (denied) return denied;
  const { id } = await ctx.params;
  await deletePlanItem(id);
  return NextResponse.json({ ok: true });
}
