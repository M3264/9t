import "../styles/globals.css";
import Pwa from "./pwa";

export const metadata = {
  title: "9t",
  description: "Your self-hosted internet workspace",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "9t",
    statusBarStyle: "default" as const,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var t=localStorage.getItem('9t-theme')||'system';var d=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=d}catch(e){}})()`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Pwa />
        {children}
      </body>
    </html>
  );
}
