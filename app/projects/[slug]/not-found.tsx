import { readLedger } from "../../../lib/data/read";
import { ProjectNotFound } from "./not-found-view";

export const dynamic = "force-dynamic";

/** not-found 拿不到 params（Next 约定），故 slug 不指名；最近 slug 索引照常从账本取 */
export default function NotFound() {
  return <ProjectNotFound data={readLedger()} now={new Date()} />;
}
