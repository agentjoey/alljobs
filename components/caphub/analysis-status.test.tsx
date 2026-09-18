import { render,screen,waitFor,cleanup } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { AnalysisStatus } from "./analysis-status";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows the imported review action from the status endpoint without invoking analysis",async()=>{
  const id=`cap_${"a".repeat(32)}`;const review=`rev_${"b".repeat(32)}`;
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({captureId:id,canonicalCaptureId:id,filename:"example.png",createdAt:"2026-09-18T00:00:00Z",
    state:"waiting_for_review",stage:null,reviewRequestId:review,jobId:null,eligibleAt:null,purgedAt:null,errorCode:null})}));
  vi.stubGlobal("fetch",fetch);
  render(<AnalysisStatus captureId={id}/>);
  await waitFor(()=>expect(screen.getByRole("link",{name:"Review results"})).toHaveAttribute("href",`/caphub/reviews/${review}`));
  expect(fetch.mock.calls).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for review");
});
