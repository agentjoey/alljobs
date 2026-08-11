import type { Metadata } from "next";
import { readLedger } from "../lib/data/read";
import { OverviewView } from "./overview-view";

export const metadata: Metadata = { title: "总览" };

// data/ 即真相：本地常驻 server，每次请求重新读文件，刷新即见改动
export const dynamic = "force-dynamic";

export default function Page() {
  const data = readLedger();
  return <OverviewView data={data} now={new Date()} />;
}
