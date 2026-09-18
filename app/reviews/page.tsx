import { redirect } from "next/navigation";
import { legacyReviewDestination } from "@/lib/caphub/automation/navigation";
export default async function ReviewsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  redirect(legacyReviewDestination(await searchParams));
}
