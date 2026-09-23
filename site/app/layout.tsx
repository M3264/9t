import type { Metadata } from "next";
import "../styles/tokens.css";
import "../styles/site.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://9t.kennyy.tech"),
  title: { default: "9t | Self-hosted workspace", template: "%s | 9t" },
  description:
    "Keep files, snippets, and links on your own server. Find them later from your browser, CLI, or Android phone.",
  openGraph: {
    title: "9t | Self-hosted workspace",
    description: "Keep files, snippets, and links on your own server. Find them later from your browser, CLI, or Android phone.",
    type: "website",
    images: ["/9t-mark.svg"],
  },
  icons: { icon: "/9t-mark.svg" },
};

const THEME_INIT = `(function(){try{var t=localStorage.getItem("9t-site-theme");document.documentElement.dataset.theme=t==="dark"||t==="light"?t:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
