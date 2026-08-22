import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ContractComment } from "@/components/workbench/ContractComment";

export const metadata: Metadata = {
  title: {
    default: "alljobs",
    template: "%s · alljobs",
  },
  description: "AgentJoey 个人工作台：多项目进度的日常追踪与管理（data/ 即真相）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={cn("font-sans")}>
      <body>
        {/* 方向契约（THESIS…FINISH · seed 755ffb78）。
            React 不渲染注释节点，故由 hidden div 承 HTML 注释置于 body 首子节点。 */}
        <ContractComment />
        {children}
      </body>
    </html>
  );
}
