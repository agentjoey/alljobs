import { CAPHUB_SECTION } from "@/components/planning/navigation";
import { SectionNav } from "@/components/planning/section-nav";

export default function CaphubLayout({children}:{children:React.ReactNode}) {
  return <><SectionNav label="Caphub" items={CAPHUB_SECTION} />{children}</>;
}
