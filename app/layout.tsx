import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ContractComment } from "@/components/ledger/contract";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: {
    default: "alljobs 工作底账",
    template: "%s · alljobs 工作底账",
  },
  description: "AgentJoey 个人工作台：多项目进度的日常追踪与管理（data/ 即真相）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable, geistMono.variable)}>
      <body>
        {/* 方向契约（THESIS…FINISH · seed cda17d0d）：与 mockup/overview.html 首注释同文。
            React 不渲染注释节点，故由 hidden div 承 HTML 注释置于 body 首子节点。 */}
        <ContractComment />
        {children}
      </body>
    </html>
  );
}
