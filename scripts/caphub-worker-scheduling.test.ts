import {expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({sweep:vi.fn(),tick:vi.fn().mockResolvedValue("idle"),end:vi.fn()}));
vi.mock("../lib/planning/config",()=>({loadControlHostConfig:()=>({config:{caphub:{enabled:true,analysis:{enabled:true,autoStart:true},retention:{enabled:true}}}})}));
vi.mock("../lib/caphub/registry/runtime",()=>({loadControlHostRegistryRuntime:async()=>({pool:{end:mocks.end}})}));
vi.mock("../lib/caphub/service/production-workflow",()=>({loadControlHostProductionWorkflow:async()=>({})}));
vi.mock("../lib/caphub/automation/worker",()=>({runAnalysisTick:mocks.tick}));
vi.mock("./caphub-retention",()=>({runConfiguredRetention:mocks.sweep}));
import {main} from "./caphub-worker";
it("runs analysis while a retention edge is pending and awaits cleanup before closing the pool",async()=>{
 let release!:()=>void;mocks.sweep.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
 const output=vi.spyOn(process.stdout,"write").mockImplementation(()=>true);
 try {
   const running=main(["--once"]);
   await vi.waitFor(()=>expect(mocks.tick).toHaveBeenCalledOnce());
   expect(mocks.end).not.toHaveBeenCalled();release();await running;
   expect(mocks.end).toHaveBeenCalledOnce();
 } finally {output.mockRestore();}
});
