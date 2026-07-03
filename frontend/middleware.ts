import { NextResponse, type NextRequest } from "next/server"

import { AUTH_COOKIE, verifySession } from "@/lib/auth"

// Guard all app pages: unauthenticated users are redirected to /login.
// /api/v1/* (backend proxy) is intentionally not matched — the backend has
// its own trust model and SSE/polling must not be broken by redirects.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(AUTH_COOKIE)?.value
  const user = await verifySession(token)

  if (pathname === "/login") {
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return NextResponse.next()
  }

  if (!user) {
    const login = new URL("/login", request.url)
    if (pathname !== "/") login.searchParams.set("from", pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // everything except: next internals, static assets, backend proxy, auth api
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
}
