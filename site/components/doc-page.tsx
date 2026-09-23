import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Suspense } from "react";
import matter from "gray-matter";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { SiteHeader, SiteFooter } from "./chrome";
import { DocsChrome } from "./docs-chrome";
import type { Metadata } from "next";

export async function docMeta(slug: string): Promise<Metadata> {
  const raw = readFileSync(join(process.cwd(), "content", `${slug}.md`), "utf8");
  const { data } = matter(raw);
  return { title: data.title as string, description: data.description as string };
}

export default async function DocPage({ slug }: { slug: string }) {
  const raw = readFileSync(join(process.cwd(), "content", `${slug}.md`), "utf8");
  const { content } = matter(raw);
  return (
    <>
      <SiteHeader section="docs" />
      <main className="main" id="main">
        <Suspense>
          <DocsChrome>
            <MDXRemote source={content} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
          </DocsChrome>
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
