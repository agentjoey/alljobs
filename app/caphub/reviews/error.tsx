"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="caphub-review-page" role="alert"><h1>Reviews unavailable</h1><button className="caphub-quiet-button" onClick={reset}>Retry</button></section>;}
