import Link from "next/link";
import { notFound } from "next/navigation";
import { mutate, readData } from "../../../lib/store";

export const dynamic="force-dynamic";

export default async function Handoff({params}:{params:Promise<{token:string}>}){
  const {token}=await params,d=await readData(),share=Object.values(d.shares).find(s=>s.token===token),object=share&&d.objects.find(o=>o.id===share.objectId);
  if(!share||!object||object.deletedAt||(share.expiresAt&&new Date(share.expiresAt)<=new Date()))notFound();
  await mutate(data=>{const current=data.shares[share.id];if(current)current.accessCount++});
  return <main className="handoff-page">
    <header><Link href="/" className="handoff-logo"><img src="/9t-mark.svg" alt="9t"/><span>9t</span></Link><div><i/>LIVE HANDOFF</div></header>
    <section className="handoff-object">
      <p>TRANSMISSION / {object.type.toUpperCase()}</p>
      <h1>{object.name}</h1>
      {object.type==="snippet"&&<pre><code>{object.content}</code></pre>}
      {object.type==="link"&&<a className="handoff-action" href={object.url} target="_blank" rel="noreferrer">OPEN DESTINATION ↗</a>}
      {object.type==="file"&&<a className="handoff-action" href={`/api/public/${token}/file`}>DOWNLOAD FILE ↓</a>}
      <footer><span>Shared from a private 9t workspace</span><span>{share.expiresAt?`Expires ${new Date(share.expiresAt).toLocaleString()}`:"No expiry"}</span></footer>
    </section>
  </main>
}
