import type { ProofIssue } from "../../../lib/data/types";

/** 校对横幅：单文件/单行解析失败不拖垮页面，指明文件与行号/字段 */
export function ProofBanner({ issues }: { issues: ProofIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="proof" role="status">
      <span className="k">校对</span>
      {issues.map((issue, i) => (
        <p key={i}>
          <code>{issue.file}</code>
          {issue.line !== undefined && <> 第 {issue.line} 行</>}
          {issue.field !== undefined && (
            <>
              {" "}
              <code>{issue.field}</code>
            </>
          )}{" "}
          {issue.message}
        </p>
      ))}
    </div>
  );
}
