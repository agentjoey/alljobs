import Link from "next/link";
export default function CaphubLayout({children}:{children:React.ReactNode}) {
  return <><nav className="caphub-subnav" aria-label="Caphub"><Link href="/caphub">Capture</Link><Link href="/caphub/reviews">Reviews</Link></nav>{children}</>;
}
