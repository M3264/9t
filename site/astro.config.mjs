import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://9t.kennyy.tech',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: { theme: 'github-dark' },
  },
});
