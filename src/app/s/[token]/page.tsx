import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { createHash } from "crypto";
import QRCode from "qrcode";
import { mutate, readData } from "@/lib/server/db";
import Unlock from "./unlock";

export const dynamic = "force-dynamic";

export default async function Handoff({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params,
    d = await readData(),
    share = Object.values(d.shares).find((s) => s.token === token),
    object = share && d.objects.find((o) => o.id === share.objectId);
  if (
    !share ||
    !object ||
    object.deletedAt ||
    (share.expiresAt && new Date(share.expiresAt) <= new Date())
  )
    notFound();
  const accessKey = createHash("sha256")
      .update(`${share.token}:${share.passwordHash || ""}`)
      .digest("hex"),
    jar = await cookies();
  const unlocked =
    !share.passwordHash || jar.get(`9t_share_${share.id}`)?.value === accessKey;
  if (!unlocked)
    return (
      <main className="handoff-page">
        <header>
          <Link href="/" className="handoff-logo">
            <img src="/9t-mark.svg" alt="9t" />
            <span>9t</span>
          </Link>
          <div>PRIVATE HANDOFF</div>
        </header>
        <Unlock token={token} name={object.name} />
      </main>
    );
  // Count views here only for non-file types.
  // Files are counted on download (public file endpoint) to avoid double-counting.
  if (object.type !== "file") {
    await mutate((data) => {
      const current = data.shares[share.id];
      if (current) current.accessCount++;
    });
  }
  const incoming = await headers(),
    origin = `${incoming.get("x-forwarded-proto") || "https"}://${incoming.get("host")}`,
    qr = await QRCode.toDataURL(`${origin}/s/${token}`, {
      width: 180,
      margin: 1,
    });
  return (
    <main className="handoff-page">
      <header>
        <Link href="/" className="handoff-logo">
          <img src="/9t-mark.svg" alt="9t" />
          <span>9t</span>
        </Link>
        <div>
          <i />
          LIVE HANDOFF
        </div>
      </header>
      <section className="handoff-object">
        <img className="handoff-qr" src={qr} alt="QR code for this handoff" />
        <p>TRANSMISSION / {object.type.toUpperCase()}</p>
        <h1>{object.name}</h1>
        {object.type === "snippet" && (
          <pre>
            <code>{object.content}</code>
          </pre>
        )}
        {object.type === "link" && (
          <a
            className="handoff-action"
            href={object.url}
            target="_blank"
            rel="noreferrer"
          >
            OPEN DESTINATION ↗
          </a>
        )}
        {object.type === "file" && (
          <a className="handoff-action" href={`/api/public/${token}/file`}>
            DOWNLOAD FILE ↓
          </a>
        )}
        <footer>
          <span>Shared from a private 9t workspace</span>
          <span>
            {share.expiresAt
              ? `Expires ${new Date(share.expiresAt).toLocaleString()}`
              : "No expiry"}
          </span>
        </footer>
      </section>
    </main>
  );
}
