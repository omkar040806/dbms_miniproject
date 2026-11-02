import { apiHandler, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { listMyPapers } from "@/lib/db/queries/papers";

// GET /api/my/papers: the logged-in user's uploads and their moderation status.
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json({ papers: await listMyPapers(user.userId) });
});
