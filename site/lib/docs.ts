export type DocPage = { slug: string; title: string };

export const PAGES: DocPage[] = [
  { slug: "index", title: "Documentation" },
  { slug: "install", title: "Install" },
  { slug: "android", title: "Android" },
  { slug: "network", title: "Network" },
  { slug: "sharing", title: "Sharing" },
  { slug: "operations", title: "Operations" },
  { slug: "api", title: "API" },
  { slug: "principles", title: "Principles" },
];

export function neighbors(slug: string) {
  const i = PAGES.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? PAGES[i - 1] : undefined,
    next: i < PAGES.length - 1 ? PAGES[i + 1] : undefined,
  };
}
