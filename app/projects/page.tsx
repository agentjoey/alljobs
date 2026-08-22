import type { Metadata } from "next";
import { EmptyState } from "@/components/workbench";

export const metadata: Metadata = { title: "项目" };

export default function Page() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        title="选择项目"
        description="在左侧列表中选择一个项目查看详情，或在手机端点击列表项。"
      />
    </div>
  );
}
