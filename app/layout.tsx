import "./globals.css";

export const metadata = { title: "9t", description: "Your self-hosted internet workspace" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
