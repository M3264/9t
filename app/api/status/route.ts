import { authenticated } from "../../../lib/auth";
import { readData } from "../../../lib/store";
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
