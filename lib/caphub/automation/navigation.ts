export function legacyReviewDestination(params: Record<string,string|string[]|undefined>) {
  if (typeof params.request === "string" && /^rev_[a-f0-9]{32}$/.test(params.request)) return `/caphub/reviews/${params.request}`;
  const query = new URLSearchParams();
  for (const key of ["kind","state","value","risk","age"]) {
    const value=params[key];
    if (typeof value === "string" && value.length<=64) query.set(key,value);
  }
  return `/caphub/reviews${query.size ? `?${query}` : ""}`;
}
