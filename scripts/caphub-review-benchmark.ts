import {request as httpsRequest} from "node:https";
import {request as httpRequest} from "node:http";
import {basename} from "node:path";
export function usefulMarker(html:string){
 const marker=html.match(/data-caphub-ready="(queue|detail|unavailable)"/);
 const registry=html.match(/data-registry-ms="(\d+)"/);
 return marker?{state:marker[1],registryMs:registry?Number(registry[1]):null}:null;
}
export async function benchmarkReview(url:string,options:{fixtureTls?:boolean}={}){
 const target=new URL(url);
 if(!["http:","https:"].includes(target.protocol)||target.username||target.password)throw new Error("Invalid benchmark URL");
 if(options.fixtureTls&&target.hostname!=="127.0.0.1")throw new Error("Fixture TLS is loopback-only");
 const start=performance.now();let firstByteMs:number|null=null,usefulMs:number|null=null,html="";
 return new Promise<{firstByteMs:number;usefulMs:number;completeMs:number;registryMs:number|null;state:string}>((resolve,reject)=>{
  const req=(target.protocol==="https:"?httpsRequest:httpRequest)(target,{rejectUnauthorized:!options.fixtureTls,headers:{accept:"text/html"}},response=>{
   if(response.statusCode!==200){response.resume();reject(new Error(`HTTP ${response.statusCode}`));return;}
   response.on("data",chunk=>{firstByteMs??=performance.now()-start;html+=chunk.toString();if(usefulMs===null&&usefulMarker(html))usefulMs=performance.now()-start;
    if(html.length>8_388_608){req.destroy(new Error("Response too large"));}});
   response.on("error",reject);response.on("end",()=>{const marker=usefulMarker(html);if(!marker||usefulMs===null||firstByteMs===null){reject(new Error("Useful content missing"));return;}
    resolve({firstByteMs:Math.round(firstByteMs),usefulMs:Math.round(usefulMs),completeMs:Math.round(performance.now()-start),...marker});});
  });
  const timeout=setTimeout(()=>req.destroy(new Error("Benchmark timed out")),10000);req.on("close",()=>clearTimeout(timeout));req.on("error",reject);req.end();
 });
}
if(basename(process.argv[1]??"")==="caphub-review-benchmark.ts"){
 const url=process.argv[2];if(!url)throw new Error("Usage: caphub:benchmark URL");
 (async()=>{const runs=[];for(let n=0;n<11;n++)runs.push(await benchmarkReview(url));process.stdout.write(JSON.stringify({cold:runs[0],warm:runs.slice(1)},null,2)+"\n");})().catch(()=>{console.error("CAPHUB_BENCHMARK_FAILED");process.exitCode=1;});
}
