import { SiteHeader, SiteFooter } from "../../components/chrome";
import { SearchBox, DocsChrome } from "../../components/docs-chrome";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader section="docs" />
      <main className="main" id="main">
        <DocsChrome>{children}</DocsChrome>
      </main>
      <SiteFooter />
    </>
  );
}
