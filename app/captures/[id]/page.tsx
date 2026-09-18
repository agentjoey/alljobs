import { notFound, redirect } from "next/navigation";
import { captureIdSchema } from "@/lib/caphub/domain/schemas";
export default async function CapturePage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if (!captureIdSchema.safeParse(id).success) notFound();
  redirect(`/caphub/captures/${id}`);
}
