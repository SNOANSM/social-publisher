import { requirePageUser } from "@/lib/session";
import { getConnectionStatus } from "@/lib/tokens";
import { isValidPostId } from "@/lib/posts";
import { Composer } from "@/components/Composer";
import { getPlanItem } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function ComposePage({ searchParams }: PageProps<"/">) {
  await requirePageUser();
  const status = await getConnectionStatus();
  const { post, idea } = await searchParams;
  const planItem = typeof idea === "string" ? await getPlanItem(idea) : null;
  const postId = typeof post === "string" && isValidPostId(post) ? post : undefined;

  return (
    <Composer
      key={postId ?? planItem?.id ?? "new"}
      connected={{ instagram: status.instagram.connected, youtube: status.youtube.connected }}
      initialPostId={postId}
      idea={planItem ? { id: planItem.id, title: planItem.title, notes: planItem.notes, date: planItem.date, time: planItem.time } : undefined}
    />
  );
}
