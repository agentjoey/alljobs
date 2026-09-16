import { ReviewCenter } from "@/components/caphub/reviews/review-center";

export default function ReviewsLoading() {
  return <ReviewCenter initialView={{ state: "loading" }} />;
}
