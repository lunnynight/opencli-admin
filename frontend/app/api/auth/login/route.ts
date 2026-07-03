import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { AUTH_COOKIE, checkCredentials, createSession } from "@/lib/auth"

export async function POST(request: Request) {
  let body: { username?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "请求格式错误" }, { status: 400 })
  }

  const { username, password } = body
  if (!username || !password || !checkCredentials(username, password)) {
    return NextResponse.json({ success: false, error: "账号或密码不正确" }, { status: 401 })
  }

  const token = await createSession(username)
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  })

  return NextResponse.json({ success: true })
}
