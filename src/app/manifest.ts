import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest & {
  share_target?: unknown;
} {
  return {
    name: "9t — Internet workspace",
    short_name: "9t",
    description: "Put it in 9t. Get it anywhere.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f9",
    theme_color: "#786294",
    icons: [
      {
        src: "/9t-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    share_target: {
      action: "/api/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "name",
        text: "text",
        url: "url",
        files: [{ name: "file", accept: ["*/*"] }],
      },
    },
  };
}
