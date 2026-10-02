import { requirePageUser } from "@/lib/session";
import { getConnectionStatus } from "@/lib/tokens";
import { isValidPostId } from "@/lib/posts";
import { Composer } from "@/components/Composer";

export const dynamic = "force-dynamic";

export default async function ComposePage({ searchParams }: PageProps<"/">) {
  await requirePageUser();
  const status = await getConnectionStatus();
  const { post } = await searchParams;
  const postId = typeof post === "string" && isValidPostId(post) ? post : undefined;

  return (
    <Composer
      key={postId ?? "new"}
      connected={{ instagram: status.instagram.connected, youtube: status.youtube.connected }}
      initialPostId={postId}
    />
  );
}
