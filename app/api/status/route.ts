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
    runtime: {
      host: process.env.NINE_T_HOST || "0.0.0.0",
      port: Number(process.env.PORT || 3265),
      https: process.env.NINE_T_HTTPS === "true",
    },
  });
}
