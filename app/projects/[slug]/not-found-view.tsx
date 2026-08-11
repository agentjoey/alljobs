import Link from "next/link";
import { deriveProjects, mastheadCounts } from "../../../lib/data/derive";
import type { LedgerData } from "../../../lib/data/types";
import { Footer } from "../../../components/ledger/footer";
import { Masthead } from "../../../components/ledger/masthead";
import { recentSlugs } from "../../../components/ledger/lib";

/** /projects/[slug] 的 404：查无此页 + 最近 slug 索引（slug 可缺：not-found.tsx 拿不到 params） */
export function ProjectNotFound({
  data,
  slug,
  now,
}: {
  data: LedgerData;
  slug?: string;
  now: Date;
}) {
  const derived = deriveProjects(data.projects, data.entries, now);
  const counts = mastheadCounts(data.projects, data.entries, now);
  const suggestions = recentSlugs(derived, 3);

  return (
    <>
      <Masthead current="projects" counts={counts} today={now} />
      <main className="ledger">
        <h1 className="sr-only">查无此页 · alljobs 工作底账</h1>
        <div className="not-found">
          <span className="bigstamp">查无此页</span>
          <p className="not-found-lead">
            {slug ? (
              <>
                底账里没有 <code className="mono">{slug}</code> 这一项。最接近的页：
              </>
            ) : (
              "底账里没有这一项。最接近的页："
            )}
          </p>
          <p className="not-found-links">
            {suggestions.map((s, i) => (
              <span key={s}>
                {i > 0 && " · "}
                <Link className="mono" href={`/projects/${s}`}>
                  {s}
                </Link>
              </span>
            ))}
            {" · "}
            <Link className="mono" href="/projects">
              项目索引 →
            </Link>
          </p>
        </div>
      </main>
      <Footer
        left="alljobs 工作底账 · data/projects/*.md"
        right={`${derived.length} 个项目在账`}
      />
    </>
  );
}
