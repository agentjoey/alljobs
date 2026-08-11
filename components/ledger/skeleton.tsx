/** 骨架：空格线本身就是 loading（本地 SSR 直出通常无感知） */
export function LedgerSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <main className="ledger">
      <div className="sheet skeleton" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="row">
            <span className="margin" />
            <span className="body" />
          </div>
        ))}
      </div>
    </main>
  );
}
