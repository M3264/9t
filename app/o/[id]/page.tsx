import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { authenticated } from "@/lib/server/auth";
import { readData } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export default async function ObjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await authenticated())) redirect("/");
  const { id } = await params;
  const object = (await readData()).objects.find(
    (item) => item.id === id && !item.deletedAt,
  );
  if (!object) notFound();
  const incoming = await headers(),
    origin = `${incoming.get("x-forwarded-proto") || "https"}://${incoming.get("host")}`;
  const qr = await QRCode.toDataURL(`${origin}/o/${id}`, {
    width: 240,
    margin: 1,
    color: { dark: "#10233e", light: "#ffffff" },
  });
  return (
    <main className="object-page">
      <header>
        <Link href="/">
          <img src="/9t-mark.svg" alt="" />
          9t
        </Link>
        <Link href="/">Back to workspace</Link>
      </header>
      <article>
        <div className="object-copy">
          <small>{object.type}</small>
          <h1>{object.name}</h1>
          {object.type === "snippet" && <pre>{object.content}</pre>}
          {object.type === "link" && (
            <a
              className="handoff-action"
              href={object.url}
              target="_blank"
              rel="noreferrer"
            >
              Open link ↗
            </a>
          )}
          {object.type === "file" && (
            <a className="handoff-action" href={`/api/files/${object.id}`}>
              Download file ↓
            </a>
          )}
          <p>Updated {new Date(object.updatedAt).toLocaleString()}</p>
        </div>
        <aside>
          <img src={qr} alt="QR code" />
          <b>Open on another device</b>
          <span>Sign in to 9t, then scan this code.</span>
        </aside>
      </article>
    </main>
  );
}
