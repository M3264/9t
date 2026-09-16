import { authenticated, unauthorized } from "../../../lib/auth";
import { mutate, readData } from "../../../lib/store";
export async function GET(){if(!await authenticated())return unauthorized();return Response.json((await readData()).config)}
export async function PATCH(req:Request){if(!await authenticated())return unauthorized();const body=await req.json();await mutate(d=>{if(body.modules)d.config.modules={...d.config.modules,...body.modules};if(["system","light","dark"].includes(body.theme))d.config.theme=body.theme;if(Number.isFinite(body.maxSizeMb)&&body.maxSizeMb>0)d.config.maxSizeMb=body.maxSizeMb});return Response.json({ok:true})}
