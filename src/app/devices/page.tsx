import { authenticated } from "@/lib/server/auth";
import { redirect } from "next/navigation";
import DeviceManager from "./DeviceManager";
export const dynamic = "force-dynamic";
export default async function DevicesPage() {
  if (!(await authenticated())) redirect("/");
  return <DeviceManager />;
}
