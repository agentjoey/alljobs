import {test,expect,type Page} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {createRasterFixture} from "../../lib/caphub/preprocess/fixtures";
import {openFixturePool} from "./caphub-review-registry-fixtures";
import {AUTOMATION_ORIGIN} from "./caphub-automation-fixtures";
import {benchmarkReview} from "../../scripts/caphub-review-benchmark";
import {getCaphubWorkItems} from "../../lib/caphub/registry/work-items";
import type {Pool} from "pg";
const evidence=resolve(".agent/caphub/automatic-analysis-screenshots");
async function shot(page:Page,name:string){for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});if(name!=="loading")await expect(page.getByText("Loading files…",{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);await page.screenshot({path:join(evidence,`${name}-${width}.png`),fullPage:true});}}
test("browser upload survives navigation, worker imports, duplicates reuse and conflicts require Human action",async({page,context})=>{
 mkdirSync(evidence,{recursive:true});const pool=openFixturePool();
 const png=Buffer.from(await createRasterFixture());
 const upload=async(bytes=png)=>{await page.goto("/caphub");await page.locator('input[type="file"]').setInputFiles({name:"automation.png",mimeType:"image/png",buffer:bytes});const pending=page.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/api/caphub/captures"));await page.getByRole("button",{name:"Receive capture",exact:true}).click();return pending;};
 try {
  const coldConnection=await benchmarkReview(`${AUTOMATION_ORIGIN}/caphub/reviews`,{fixtureTls:true});expect(coldConnection.usefulMs).toBeLessThanOrEqual(5000);
  await page.goto("/caphub/reviews");await expect(page.getByText("No files match this view.",{exact:false})).toBeVisible();await shot(page,"empty");
  await page.goto("/caphub");await shot(page,"upload");
  const received=await upload();expect(received.status()).toBe(201);const receipt=await received.json();expect(receipt.analysis.enqueue).toBe("saved");
  await shot(page,"active");
  await page.close();page=await context.newPage();
  await page.goto(`/caphub/captures/${receipt.capture.id}`);
  await expect(page.getByRole("link",{name:"Review results"})).toBeVisible({timeout:30000});
  const reviewHref=await page.getByRole("link",{name:"Review results"}).getAttribute("href");expect(reviewHref).toMatch(/^\/caphub\/reviews\/rev_/);
  const calls=Number((await pool.query("SELECT count(*) FROM caphub.audit_events WHERE event_type='model.started'")).rows[0].count);expect(calls).toBeGreaterThan(0);
  await page.getByRole("link",{name:"Review results"}).click();await expect(page.locator('[data-caphub-ready="detail"]')).toBeVisible();
  await expect(page.getByRole("heading",{name:"automation.png",exact:true})).toBeVisible();
  expect(await page.locator("details[open]").count()).toBe(0);await shot(page,"detail");
  await page.goto("/reviews?value=medium");await expect(page).toHaveURL(/\/caphub\/reviews\?value=medium/);
  await expect(page.locator(".caphub-items li")).toHaveCount(1);await shot(page,"queue");
  const duplicate=await upload();expect(duplicate.status()).toBe(200);expect((await duplicate.json()).capture.id).toBe(receipt.capture.id);
  expect(Number((await pool.query("SELECT count(*) FROM caphub.audit_events WHERE event_type='model.started'")).rows[0].count)).toBe(calls);
  const changed=Buffer.concat([png,Buffer.from("different bytes")]);const conflict=await upload(changed);expect(conflict.status()).toBe(409);
  await expect(page.getByRole("heading",{name:"Same filename, different image"})).toBeFocused();await shot(page,"conflict");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();expect(Number((await pool.query("SELECT count(*) FROM caphub.analysis_requests")).rows[0].count)).toBe(1);
  await upload(changed);const confirmed=page.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/api/caphub/captures"));await page.getByRole("button",{name:"Create new version"}).click();const versionResponse=await confirmed;expect(versionResponse.status()).toBe(201);
  const versionReceipt=await versionResponse.json();await page.goto(`/caphub/captures/${versionReceipt.capture.id}`);
  await expect(page.getByRole("link",{name:"Review results"})).toBeVisible({timeout:30000});
  const queue:Awaited<ReturnType<typeof benchmarkReview>>[]=[];const detail:typeof queue=[];
  for(let n=0;n<11;n++){queue.push(await benchmarkReview(`${AUTOMATION_ORIGIN}/caphub/reviews`,{fixtureTls:true}));detail.push(await benchmarkReview(`${AUTOMATION_ORIGIN}${reviewHref}`,{fixtureTls:true}));}
  writeFileSync(resolve(".agent/caphub/automatic-analysis-performance.json"),JSON.stringify({environment:"owned local PostgreSQL; fake HTTP providers; not production Neon latency",coldConnection,queue,detail},null,2));
  for(const runs of [queue,detail]){expect(runs[0].usefulMs).toBeLessThanOrEqual(5000);expect(runs.slice(1).filter(r=>r.usefulMs<=(runs===queue?2000:3000)).length).toBeGreaterThanOrEqual(9);expect(Math.max(...runs.slice(1).map(r=>r.firstByteMs))).toBeLessThanOrEqual(250);}
  expect(Math.max(...queue.slice(1).map(r=>r.usefulMs))).toBeLessThanOrEqual(3000);
  await pool.query("UPDATE caphub.capture_object_retention SET imported_at='2026-01-01',eligible_at='2026-01-31',purged_at='2026-02-01' WHERE capture_id=$1",[receipt.capture.id]);
  await page.goto(reviewHref!);await expect(page.getByText("Raw image expired. Parsed information is retained.")).toBeVisible();await shot(page,"expired");
  let statement="";let parameters:unknown[]=[];
  await getCaphubWorkItems({query:async(sql:string,values:unknown[])=>{statement=sql;parameters=values;return pool.query(sql,values);}} as unknown as Pool);
  const plan=await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${statement}`,parameters);
  writeFileSync(resolve(".agent/caphub/automatic-analysis-query-plan.json"),JSON.stringify(plan.rows,null,2));
  const lock=await pool.connect();
  try {
   await lock.query("BEGIN");await lock.query("LOCK TABLE caphub.capture_filename_heads IN ACCESS EXCLUSIVE MODE");
   await page.goto("/caphub/reviews",{waitUntil:"commit"});await expect(page.getByText("Loading files…",{exact:true})).toBeVisible();await shot(page,"loading");
   await expect(page.locator('[data-caphub-ready="unavailable"]')).toBeVisible();await shot(page,"error");
  }finally{await lock.query("ROLLBACK");lock.release();}
 }finally{await pool.end();}
});
