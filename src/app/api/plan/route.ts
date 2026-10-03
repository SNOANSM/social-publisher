import { NextResponse } from "next/server";
import { apiUser, jsonError } from "@/lib/session";
import { createPlanItem, listPlan, sanitizePlanInput } from "@/lib/plan";

export async function GET() {
  const { denied } = await apiUser();
  if (denied) return denied;
  return NextResponse.json({ items: await listPlan() });
}

export async function POST(req: Request) {
  const { user, denied } = await apiUser();
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("الطلب غير صالح.");
  const data = sanitizePlanInput({ title: "", ...body });
  if (typeof data === "string") return jsonError(data);
  return NextResponse.json({ item: await createPlanItem(data, user.email) });
}
