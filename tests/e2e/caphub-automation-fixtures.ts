import {spawn,type ChildProcess} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {createServer as httpServer,request} from "node:http";
import {createServer as httpsServer,type Server} from "node:https";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {createCaphubReviewFixture,readCaphubReviewFixture,reviewFixtureEnvironment} from "./caphub-review-registry-fixtures";
import {startCaphubTestPostgres,type CaphubTestPostgres} from "../helpers/caphub-postgres";
import {applyRegistryMigrations} from "../../lib/caphub/registry/migrate";
import {AnalysisRequests} from "../../lib/caphub/registry/postgres/analysis-requests";
import {runAnalysisTick} from "../../lib/caphub/automation/worker";
import {createReviewPacketImporter} from "../../lib/caphub/registry/import-review-packet";
import {PostgresCaptureStore,PostgresAnalysisJobStore,PostgresStageArtifactStore,PostgresModelCallAuditStore} from "../../lib/caphub/registry/postgres/caphub-stores";
import {LocalCaptureObjectStore} from "../../lib/caphub/storage/local-objects";
import {withObjectLock} from "../../lib/caphub/automation/retention";
import type {PilotMiniMax as MiniMaxFixture,PilotDeepSeek as DeepSeekFixture} from "./caphub-production-pilot-analysis";
export {readCaphubReviewFixture as readAutomationFixture,reviewFixtureEnvironment as automationEnvironment};
export const AUTOMATION_ORIGIN="https://127.0.0.1:3472";
export function createAutomationFixture(){
 const fixture=createCaphubReviewFixture();
 const config=JSON.parse(readFileSync(fixture.configPath,"utf8"));
 config.caphub.allowedOrigins=[AUTOMATION_ORIGIN];
 config.caphub.analysis={enabled:true,autoStart:true};
 config.caphub.retention={enabled:false};
 writeFileSync(fixture.configPath,JSON.stringify(config),{mode:0o600});
 return fixture;
}
async function serve(){
 const {createAnalysisService}=await import("../../lib/caphub/service/analyze");
 const {createProductionAnalysisWorkflow}=await import("../../lib/caphub/service/production-workflow");
 const {PilotMiniMax,PilotDeepSeek,pilotSourceGateway}=await import("./caphub-production-pilot-analysis");
 const fixture=readCaphubReviewFixture();let pg:CaphubTestPostgres|undefined;let next:ChildProcess|undefined;let proxy:Server|undefined;
 const controller=new AbortController();let worker:Promise<void>|undefined;
 const mini=new PilotMiniMax(),deep=new PilotDeepSeek();
 const edge=httpServer(async(req,res)=>{
  try {
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
   const result=req.url==="/observe"?await mini.observe():req.url==="/search"?await mini.search():req.url==="/structure"?await deep.structureExtraction():await deep.invoke(body);
   res.setHeader("content-type","application/json");res.end(JSON.stringify(result));
  } catch {res.writeHead(500);res.end();}
 });
 let stopping=false;
 const stop=async(code:number)=>{
  if(stopping)return;stopping=true;controller.abort();
  proxy?.closeAllConnections();await new Promise<void>(r=>proxy?proxy.close(()=>r()):r());
  if(next&&next.exitCode===null){next.kill("SIGTERM");await new Promise<void>(r=>next!.once("exit",()=>r()));}
  await worker;edge.closeAllConnections();await new Promise<void>(r=>edge.close(()=>r()));await pg?.stop();process.exit(code);
 };
 try {
  await new Promise<void>((r,j)=>{edge.once("error",j);edge.listen(0,"127.0.0.1",r);});
  const port=(edge.address() as {port:number}).port;
  async function invoke<T>(path:string,input?:unknown):Promise<T>{const response=await fetch(`http://127.0.0.1:${port}/${path}`,{method:"POST",body:JSON.stringify(input??{}),signal:controller.signal});if(!response.ok)throw new Error("fixture edge failed");return response.json();}
  pg=await startCaphubTestPostgres();await applyRegistryMigrations(pg.pool);
  writeFileSync(fixture.statePath,JSON.stringify({schemaVersion:1,socketDir:pg.socketDir,port:pg.port}),{mode:0o600});
  const pool=pg.appPool,captures=new PostgresCaptureStore(pool),jobs=new PostgresAnalysisJobStore(pool),artifacts=new PostgresStageArtifactStore(pool);
  const observer={provider:"minimax" as const,model:mini.model,observe:()=>invoke<Awaited<ReturnType<MiniMaxFixture["observe"]>>>("observe"),search:()=>invoke<Awaited<ReturnType<MiniMaxFixture["search"]>>>("search"),invoke:()=>mini.invoke()};
  const structurer={provider:"deepseek" as const,model:deep.model,structureExtraction:()=>invoke<Awaited<ReturnType<DeepSeekFixture["structureExtraction"]>>>("structure"),invoke:(input:Parameters<DeepSeekFixture["invoke"]>[0])=>invoke<Awaited<ReturnType<DeepSeekFixture["invoke"]>>>("invoke",input)};
  const analysis=createAnalysisService({config:{caphubEnabled:true,analysisEnabled:true},captures,jobs,artifacts,audits:new PostgresModelCallAuditStore(pool),
   readObject:capture=>withObjectLock(pool,capture.object.digest,()=>new LocalCaptureObjectStore(fixture.stateDir).readImmutable(capture.object)),
   preprocessDependencies:{recognizeText:async()=>[{page:0,text:"Pilot Capability",confidence:.99,bbox:{x:0,y:0,width:1,height:1}}],decodeBarcodes:async()=>[]},
   extractionObserver:observer,extractionStructurer:structurer,researchSearchProvider:observer,researchProvider:structurer,assessmentProvider:structurer,criticProvider:observer,sourceGateway:pilotSourceGateway,clock:()=>new Date()});
  const workflow=createProductionAnalysisWorkflow({analysis,importer:createReviewPacketImporter({pool,captures,jobs,artifacts,clock:()=>new Date().toISOString()})});
  const requests=new AnalysisRequests(pool);
  worker=(async()=>{while(!controller.signal.aborted){
   await delay(1500,undefined,{signal:controller.signal}).catch(()=>{});
   try{await runAnalysisTick({requests,workflow,clock:()=>new Date(),ownerToken:randomUUID},controller.signal);}catch(error){if(!controller.signal.aborted)console.error("fixture worker failed",error);}
  }})();
  next=spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),"start","-p","3473","-H","127.0.0.1"],{stdio:"inherit",env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",...reviewFixtureEnvironment(fixture),CAPHUB_E2E_DATABASE_URL:`postgresql://caphub_app@localhost/postgres?host=${encodeURIComponent(pg.socketDir)}&port=${pg.port}&sslmode=disable`}});
  proxy=httpsServer({key:readFileSync(fixture.keyPath),cert:readFileSync(fixture.certPath)},(incoming,outgoing)=>{
   const upstream=request({hostname:"127.0.0.1",port:3473,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
   upstream.on("error",()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
  });
  next.once("exit",code=>{if(!stopping)void stop(code||1);});proxy.on("error",()=>void stop(1));
  for(const signal of ["SIGTERM","SIGINT"] as const)process.once(signal,()=>void stop(0));
  proxy.listen(3472,"127.0.0.1");
 }catch(error){console.error("Isolated automation fixture failed",error);await stop(1);}
}
if(process.argv[2]==="serve-caphub-automation")void serve();
