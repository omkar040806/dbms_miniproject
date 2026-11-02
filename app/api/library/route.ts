import { apiHandler, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { getLibrary } from "@/lib/db/queries/library";

// GET /api/library: reading list, status counts and collections of the logged-in user.
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json(await getLibrary(user.userId));
});
