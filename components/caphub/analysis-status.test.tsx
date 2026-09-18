import { render,screen,waitFor,cleanup,act } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { AnalysisStatus } from "./analysis-status";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it("backs off failed reads, stops after terminal state and cancels on unmount",async()=>{
 vi.useFakeTimers();const id=`cap_${"c".repeat(32)}`;
 const status={captureId:id,canonicalCaptureId:id,filename:"file.png",createdAt:"2026-09-18T00:00:00Z",state:"completed",stage:null,reviewRequestId:null,jobId:null,eligibleAt:null,purgedAt:null,errorCode:null};
 const fetch=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ok:true,json:async()=>status});vi.stubGlobal("fetch",fetch);
 const view=render(<AnalysisStatus captureId={id}/>);
 await act(()=>vi.advanceTimersByTimeAsync(0));expect(fetch).toHaveBeenCalledTimes(1);
 await act(()=>vi.advanceTimersByTimeAsync(9999));expect(fetch).toHaveBeenCalledTimes(1);
 await act(()=>vi.advanceTimersByTimeAsync(1));expect(fetch).toHaveBeenCalledTimes(2);
 await act(()=>vi.advanceTimersByTimeAsync(20000));expect(fetch).toHaveBeenCalledTimes(2);
 view.unmount();expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
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
