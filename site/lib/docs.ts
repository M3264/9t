export type DocPage = { slug: string; title: string };
export type DocGroup = { label: string; pages: DocPage[] };

const ALL: DocPage[] = [
  { slug: "index", title: "Introduction" },
  { slug: "install", title: "Install" },
  { slug: "android", title: "Android" },
  { slug: "network", title: "Network" },
  { slug: "sharing", title: "Sharing" },
  { slug: "operations", title: "Operations" },
  { slug: "api", title: "API" },
  { slug: "principles", title: "Principles" },
];

export const GROUPS: DocGroup[] = [
  { label: "Start", pages: [ALL[0], ALL[1]] },
  { label: "Guides", pages: [ALL[2], ALL[3], ALL[4]] },
  { label: "Reference", pages: [ALL[5], ALL[6], ALL[7]] },
];

export const PAGES: DocPage[] = ALL;

export function neighbors(slug: string) {
  const i = ALL.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? ALL[i - 1] : undefined,
    next: i < ALL.length - 1 ? ALL[i + 1] : undefined,
  };
}

export type TocItem = { depth: 2 | 3; id: string; text: string };

export function tocOf(markdown: string): TocItem[] {
  return markdown
    .split("\n")
    .filter((l) => /^#{2,3} /.test(l))
    .map((l) => {
      const depth = l.startsWith("### ") ? 3 : 2;
      const text = l.replace(/^#{2,3} /, "").trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      return { depth, id, text };
    });
}
