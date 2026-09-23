import { SiteHeader, SiteFooter } from "../../components/chrome";
import { Suspense } from "react";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader section="docs" />
      <main className="main" id="main">
        <Suspense>{children}</Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
