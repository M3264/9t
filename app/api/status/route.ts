import { authenticated } from "@/lib/server/auth";
import { readData } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET() {
  const d = await readData();
  return Response.json({
    initialized: d.config.initialized,
    authenticated: await authenticated(),
    config: d.config,
    username: d.user?.username,
  });
}
