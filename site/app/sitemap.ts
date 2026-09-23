import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const ROUTES = ["", "/docs/", "/docs/install/", "/docs/android/", "/docs/network/", "/docs/sharing/", "/docs/operations/", "/docs/principles/"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `https://9t.kennyy.tech${route}`,
    lastModified: new Date(),
  }));
}
