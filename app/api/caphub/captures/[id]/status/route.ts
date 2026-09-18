import { captureIdSchema } from "@/lib/caphub/domain/schemas";
import { getCaphubCaptureStatus } from "@/lib/caphub/registry/review-workbench";
import { readWorkbench } from "@/lib/caphub/registry/read-workbench";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const headers={"cache-control":"no-store","x-content-type-options":"nosniff"};
  if (!captureIdSchema.safeParse(id).success) return Response.json({error:{code:"INVALID_CAPTURE_ID"}},{status:400,headers});
  const view=await readWorkbench(pool=>getCaphubCaptureStatus(pool,id));
  if (view.state!=="ready") return Response.json({error:{code:"REGISTRY_UNAVAILABLE"}},{status:503,headers});
  if (!view.data) return Response.json({error:{code:"CAPTURE_NOT_FOUND"}},{status:404,headers});
  return Response.json(view.data,{headers});
}
