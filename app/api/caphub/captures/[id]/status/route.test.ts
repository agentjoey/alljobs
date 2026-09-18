import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),status:vi.fn()}));
vi.mock("@/lib/caphub/registry/read-workbench",()=>({readWorkbench:mocks.read}));
vi.mock("@/lib/caphub/registry/review-workbench",()=>({getCaphubCaptureStatus:mocks.status}));
import {GET} from "./route";
const id=`cap_${"a".repeat(32)}`;
beforeEach(()=>vi.clearAllMocks());
it("rejects invalid IDs before any registry read",async()=>{
 const response=await GET(new Request("https://example.test"),{params:Promise.resolve({id:"../private"})});
 expect(response.status).toBe(400);expect(mocks.read).not.toHaveBeenCalled();
});
it.each([["unavailable",503],["disabled",503],["ready",404]] as const)("bounds %s responses and forbids caching",async(state,code)=>{
 mocks.read.mockResolvedValue({state,data:null});
 const response=await GET(new Request("https://example.test"),{params:Promise.resolve({id})});
 expect(response.status).toBe(code);expect(response.headers.get("cache-control")).toBe("no-store");
});
