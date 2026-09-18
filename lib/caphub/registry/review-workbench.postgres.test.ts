import {afterAll,beforeAll,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {startCaphubTestPostgres,type CaphubTestPostgres} from "../../../tests/helpers/caphub-postgres";
import {createCaphubReviewFixture,seedReviewCandidate,type CaphubReviewFixture} from "../../../tests/e2e/caphub-review-registry-fixtures";
import {applyRegistryMigrations} from "./migrate";
import {applyAutomationBackfill,inspectAutomationBackfill} from "../automation/backfill";
import {getCaphubWorkItems} from "./work-items";
import {getCaphubReviewDetail,getCaphubCaptureStatus} from "./review-workbench";
let pg:CaphubTestPostgres;let files:CaphubReviewFixture;
beforeAll(async()=>{pg=await startCaphubTestPostgres();await applyRegistryMigrations(pg.pool);files=createCaphubReviewFixture();},30000);
afterAll(async()=>{await pg?.stop();files?.cleanup();});
it("selects imported active review rather than superseded alias and reads a bounded private-safe detail",async()=>{
 const common={filename:"shared.png",objectDigest:"a".repeat(64)};
 const old=await seedReviewCandidate(pg.pool,files,"old-alias",{...common,createdAt:"2026-09-01T00:00:00Z"});
 const current=await seedReviewCandidate(pg.pool,files,"current-alias",{...common,createdAt:"2026-09-02T00:00:00Z"});
 await pg.pool.query("UPDATE caphub.review_requests SET state='SUPERSEDED',superseded_by_request_id=$2 WHERE request_id=$1",[old.requestId,current.requestId]);
 const report=await inspectAutomationBackfill(pg.pool);
 expect(report.ready.find(row=>row.filenameKey==="shared.png")?.canonical.id).toBe(current.captureId);
 await applyAutomationBackfill(pg.pool);
 const rows=await getCaphubWorkItems(pg.appPool);
 expect(rows.items).toHaveLength(1);expect(rows.items[0].reviewRequestId).toBe(current.requestId);
 const connect=vi.spyOn(pg.appPool,"connect");
 const detail=await getCaphubReviewDetail(pg.appPool,current.requestId);
 expect(connect).toHaveBeenCalledTimes(1);connect.mockRestore();
 expect(detail.kind).toBe("found");
 if(detail.kind==="found"){expect(detail.filename).toBe("shared.png");expect(detail.history.length).toBeLessThanOrEqual(25);}
 expect((await getCaphubCaptureStatus(pg.appPool,old.captureId))?.canonicalCaptureId).toBe(current.captureId);
 await expect(getCaphubCaptureStatus(pg.appPool,"bad")).rejects.toThrow();
},30000);
it("imports repeated entity/candidate content at a later time without sharing review authority",async()=>{
 const first=await seedReviewCandidate(pg.pool,files,"same-capability-one",{sharedEntity:true,createdAt:"2026-09-03T00:00:00Z"});
 const second=await seedReviewCandidate(pg.pool,files,"same-capability-two",{sharedEntity:true,createdAt:"2026-09-04T00:00:00Z"});
 expect(second.requestId).not.toBe(first.requestId);expect(second.candidateId).not.toBe(first.candidateId);
 expect((await getCaphubReviewDetail(pg.appPool,first.requestId)).kind).toBe("found");
 expect((await getCaphubReviewDetail(pg.appPool,second.requestId)).kind).toBe("found");
},30000);
