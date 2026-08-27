import { PortfolioOverview } from "@/components/planning/portfolio-overview";
import { getPortfolioOverview } from "@/lib/planning/queries/portfolio";

export default async function HomePage() {
  const data = await getPortfolioOverview();
  return <PortfolioOverview data={data} />;
}
