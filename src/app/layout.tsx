import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrowthOS | 个人自我驱动型成长操作系统",
  description: "一款基于学习科学与 AI Agent 驱动的个人成长操作系统。融合 WOOP、习惯打卡、SM-2 间隔重复及 AI 陪练，助你无损构建原子习惯与深度知识库。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#121212" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="https://img.icons8.com/nolan/512/rocket.png" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
