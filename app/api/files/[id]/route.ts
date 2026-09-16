import { readFile } from "fs/promises";
import { authenticated, unauthorized } from "../../../../lib/auth";
import { readData, uploadDir } from "../../../../lib/store";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){if(!await authenticated())return unauthorized();const {id}=await params;const o=(await readData()).objects.find(x=>x.id===id&&!x.deletedAt&&x.type==="file");if(!o?.storageKey)return new Response("Not found",{status:404});const data=await readFile(`${uploadDir}/${o.storageKey}`);return new Response(new Uint8Array(data),{headers:{"Content-Type":o.mimeType||"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(o.name)}`,"Content-Length":String(data.length)}})}
