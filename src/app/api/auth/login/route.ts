import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { success: false, message: "请输入密码" },
        { status: 400 }
      );
    }

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { success: false, message: "密码错误" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    return setAuthCookie(response);
  } catch {
    return NextResponse.json(
      { success: false, message: "请求格式错误" },
      { status: 400 }
    );
  }
}
