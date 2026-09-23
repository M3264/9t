import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import { MDXRemote } from "next-mdx-remote/rsc";
import type { Metadata } from "next";

// NOTE: chrome (header, sidebar, footer) comes from app/docs/layout.tsx.
// This component renders only the page content.
export async function docMeta(slug: string): Promise<Metadata> {
  const raw = readFileSync(join(process.cwd(), "content", `${slug}.md`), "utf8");
  const { data } = matter(raw);
  return { title: data.title as string, description: data.description as string };
}

export default async function DocPage({ slug }: { slug: string }) {
  const raw = readFileSync(join(process.cwd(), "content", `${slug}.md`), "utf8");
  const { content } = matter(raw);
  return (
    <MDXRemote
      source={content}
      options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
    />
  );
}
