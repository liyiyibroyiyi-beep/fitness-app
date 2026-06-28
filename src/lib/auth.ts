// ============================================================
// Auth helpers — HMAC-signed cookie for admin access
// ============================================================
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "admin-token";

/** Sign the admin password with HMAC-SHA256 using ADMIN_SECRET */
export function getAdminToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SECRET;
  if (!password || !secret) {
    throw new Error("ADMIN_PASSWORD and ADMIN_SECRET env vars must be set");
  }
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

/** Constant-time comparison of two strings to prevent timing attacks */
function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still call timingSafeEqual (with same buffer) to avoid leaking length info
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const sharedCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Check if the current request has a valid admin-token cookie */
export async function requireAuth(): Promise<NextResponse | null> {
  // Read cookie — cannot use set() on ReadonlyRequestCookies from headers()
  const headerCookies = await cookies();
  const token = headerCookies.get(COOKIE_NAME)?.value;

  let adminToken: string;
  try {
    adminToken = getAdminToken();
  } catch {
    console.error("Missing ADMIN_PASSWORD or ADMIN_SECRET env vars");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  if (!token || !tokensEqual(token, adminToken)) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  return null; // auth passed
}

/** Attach admin-token cookie to a response */
export function setAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, getAdminToken(), {
    ...sharedCookieOptions,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  return response;
}

/** Clear admin-token cookie on a response */
export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, "", {
    ...sharedCookieOptions,
    maxAge: 0,
  });
  return response;
}

/** GET handler helper: read token from cookies and compare */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const headerCookies = await cookies();
    const token = headerCookies.get(COOKIE_NAME)?.value;

    let adminToken: string;
    try {
      adminToken = getAdminToken();
    } catch {
      console.error("Missing ADMIN_PASSWORD or ADMIN_SECRET env vars");
      return false;
    }

    return !!token && tokensEqual(token, adminToken);
  } catch {
    return false;
  }
}
