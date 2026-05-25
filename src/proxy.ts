import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 简单 SHA-256 哈希工具方法，用于 Edge Runtime (Web Crypto API)
async function getSha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// 遵循 Next.js 16 约定的 proxy 函数
export async function proxy(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;

  // 如果没有设置密码，说明无需验证，直接放行
  if (!sitePassword) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 拦截除密码验证路由与第三方上传路由外的所有 /api/* 请求
  if (
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/verify') &&
    !pathname.startsWith('/api/uploadthing')
  ) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new NextResponse(
        JSON.stringify({ success: false, message: '未授权的 API 访问' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7); // 去掉 "Bearer "
    const expectedToken = await getSha256(sitePassword);

    if (token !== expectedToken) {
      return new NextResponse(
        JSON.stringify({ success: false, message: '未授权的 API 访问：Token 错误' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return NextResponse.next();
}

// 匹配拦截规则
export const config = {
  matcher: '/api/:path*',
};
