import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { mutate, readData } from "./store";

const COOKIE="9t_session";
export function passwordHash(password:string,salt:string){return scryptSync(password,salt,64).toString("hex")}
export function makePassword(password:string){const salt=randomBytes(16).toString("hex");return {salt,passwordHash:passwordHash(password,salt)}}
export function verifyPassword(password:string,salt:string,expected:string){const a=Buffer.from(passwordHash(password,salt),"hex"),b=Buffer.from(expected,"hex");return a.length===b.length&&timingSafeEqual(a,b)}
export async function createSession(){const token=randomBytes(32).toString("base64url"),key=createHash("sha256").update(token).digest("hex"),expires=new Date(Date.now()+7*864e5);await mutate(d=>{d.sessions[key]={expiresAt:expires.toISOString()}});const jar=await cookies();jar.set(COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NINE_T_HTTPS==="true",path:"/",expires});}
export async function authenticated(){const token=(await cookies()).get(COOKIE)?.value;if(!token)return false;const key=createHash("sha256").update(token).digest("hex"),session=(await readData()).sessions[key];return !!session&&new Date(session.expiresAt)>new Date()}
export async function destroySession(){const jar=await cookies(),token=jar.get(COOKIE)?.value;if(token){const key=createHash("sha256").update(token).digest("hex");await mutate(d=>{delete d.sessions[key]})}jar.delete(COOKIE)}
export function unauthorized(){return Response.json({error:"unauthorized"},{status:401})}
