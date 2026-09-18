import { expect,it } from "vitest";
import { legacyReviewDestination } from "./navigation";
it("keeps recognized filters while moving selected reviews into Caphub",()=>{
  const id=`rev_${"a".repeat(32)}`;
  expect(legacyReviewDestination({request:id})).toBe(`/caphub/reviews/${id}`);
  expect(legacyReviewDestination({state:"WAITING_FOR_REVIEW",value:"high",unsafe:"secret"})).toBe("/caphub/reviews?state=WAITING_FOR_REVIEW&value=high");
  expect(legacyReviewDestination({request:"../../secret"})).toBe("/caphub/reviews");
});
