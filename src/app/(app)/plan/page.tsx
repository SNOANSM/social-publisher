import { requirePageUser } from "@/lib/session";
import { listPlan } from "@/lib/plan";
import { PlanBoard } from "@/components/PlanBoard";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  await requirePageUser();
  const items = await listPlan();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">الخطة</h1>
        <p className="mt-1 text-sm text-muted">اكتب أفكارك ورتبها على أيام الأسبوع، ومن أي فكرة تقدر تبدأ المنشور مباشرة.</p>
      </div>
      <PlanBoard initial={items} />
    </div>
  );
}
