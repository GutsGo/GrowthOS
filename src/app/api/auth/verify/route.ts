import { NextResponse } from "next/server";

// 简单 SHA-256 哈希工具方法，完美兼容 Node.js 和 Cloudflare Edge/Worker 运行环境
async function getSha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

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
      const token = await getSha256(sitePassword);
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
