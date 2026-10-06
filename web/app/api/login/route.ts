import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSession, hashCode } from "@/lib/access";
import { run } from "@/lib/db";
import { emailForCode } from "@/lib/queries";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (code.length < 10 || code.length > 100) return NextResponse.json({ detail: "wrong code" }, { status: 401 });
  let email: string | null;
  try {
    email = await emailForCode(run, await hashCode(code));
  } catch {
    return NextResponse.json({ detail: "data unavailable" }, { status: 502 });
  }
  if (!email) return NextResponse.json({ detail: "wrong code" }, { status: 401 });
  const token = await createSession(email);
  if (!token) return NextResponse.json({ detail: "sign-in is not configured on the server" }, { status: 500 });
  const res = NextResponse.json({ email });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
