import {expect,it} from "vitest";
import {usefulMarker,benchmarkReview} from "./caphub-review-benchmark";
it("does not count a streamed shell or loading skeleton as useful content",()=>{
 expect(usefulMarker('<html><p>Loading reviews…</p>')).toBeNull();
 expect(usefulMarker('<section data-caphub-ready="queue" data-registry-ms="39">')).toEqual({state:"queue",registryMs:39});
 expect(usefulMarker('<p data-caphub-ready="unavailable">')).toEqual({state:"unavailable",registryMs:null});
});
it("never disables TLS verification for a remote host",async()=>{await expect(benchmarkReview("https://example.com",{fixtureTls:true})).rejects.toThrow("loopback-only");});
