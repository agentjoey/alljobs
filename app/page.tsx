export default async function HomePage() {
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <p className="text-xs font-mono tracking-widest text-[#5E584D] uppercase">
          Federated Planning Control Plane
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[#16140E] mt-1">
          AllJobs Planning Core
        </h1>
        <p className="text-[#4A463C] text-sm mt-1">
          Single-owner personal planning control plane for code and business operations.
        </p>
      </header>

      <section className="bg-[#FBF7E6] border border-[rgba(22,20,14,0.16)] rounded-lg p-5">
        <h2 className="text-base font-semibold text-[#16140E]">
          Workbench Foundation
        </h2>
        <p className="text-[#4A463C] text-sm mt-1">
          Paper Workbench runtime initialized. Federated project projections and native Task models are ready for integration.
        </p>
      </section>
    </main>
  );
}
