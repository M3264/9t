import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Metadata } from "next";
import { tocOf } from "../lib/docs";
import { mdxComponents } from "./mdx";
import { DocsChrome } from "./docs-chrome";

// NOTE: site header/footer come from app/docs/layout.tsx.
// DocRoute renders the sidebar + content + TOC shell for one slug.
export async function docMeta(slug: string): Promise<Metadata> {
  const raw = readFileSync(join(process.cwd(), "content", `${slug}.md`), "utf8");
  const { data } = matter(raw);
  return { title: data.title as string, description: data.description as string };
}

export async function DocRoute({ slug }: { slug: string }) {
  const raw = readFileSync(join(process.cwd(), "content", `${slug}.md`), "utf8");
  const { content } = matter(raw);
  return (
    <DocsChrome slug={slug} toc={tocOf(content)}>
      <MDXRemote
        source={content}
        components={mdxComponents}
        options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
      />
    </DocsChrome>
  );
}

export default DocRoute;
