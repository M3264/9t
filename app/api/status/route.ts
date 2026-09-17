import { authenticated } from "@/lib/server/auth";
import { readData } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const d = await readData();
  const authed = await authenticated(req);
  // Avoid leaking config/username to unauthenticated callers.
  if (!authed) {
    return Response.json({ initialized: d.config.initialized });
  }
  return Response.json({
    initialized: d.config.initialized,
    authenticated: true,
    config: d.config,
    username: d.user?.username,
  });
}
