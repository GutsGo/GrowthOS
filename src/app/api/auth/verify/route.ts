import { NextResponse } from "next/server";
import { createHash } from "crypto";

// 入口密码验证 API
export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    const sitePassword = process.env.SITE_PASSWORD;

    // 未配置密码时跳过验证，直接放行
    if (!sitePassword) {
      return NextResponse.json({ success: true });
    }

    if (!password) {
      return NextResponse.json(
        { success: false, message: "请输入访问密码" },
        { status: 400 }
      );
    }

    if (password === sitePassword) {
      const token = createHash("sha256").update(sitePassword).digest("hex");
      return NextResponse.json({ success: true, token });
    }

    return NextResponse.json(
      { success: false, message: "密码错误，请重试" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
