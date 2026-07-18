# astro-md-content-negotiation

Astro integration that generates a Markdown (`.md`) version of every page at build time, making your site more friendly to LLMs and AI crawlers, and enabling HTTP content negotiation (serve HTML and Markdown from the same URL).

LLMs parse Markdown far more efficiently than HTML. By serving clean Markdown to clients that request it, you improve how your content is understood and cited by tools like ChatGPT, Perplexity, and Claude, with zero runtime cost.

```bash
npm install astro-md-content-negotiation
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import markdownExport from "astro-md-content-negotiation";

export default defineConfig({
  integrations: [markdownExport()],
});
```

After building, every `.html` in your output directory will have a `.md` sibling. Pair with a hosting-layer adapter (see below) to negotiate at request time.

## How it works

1. Hooks into `astro:build:done` — runs after Astro finishes the build.
2. Finds every `.html` file in the output directory.
3. Extracts the main content (`<main>`, `<article>`, or `<body>`).
4. Converts it to Markdown with [Turndown](https://github.com/mixmark-io/turndown) + the GFM plugin.
5. Writes the result as a sibling `.md` file.

No runtime dependencies, no SSR required. Works with `output: "static"`.

## Options

```js
markdownExport({
  // Glob patterns (relative to dist/) to skip.
  exclude: ["404.html", "admin/**"],

  // HTML tags to extract content from, in priority order.
  // First match wins; falls back to the full document.
  selectors: ["main", "article", "body"],

  // Extra elements to strip from the Markdown output
  // (nav, footer, header, script, style, noscript, svg are
  // always stripped). Each entry is a tag name string or a
  // predicate function (node: HTMLElement) => boolean.
  removeElements: ["aside", "form"],

  // Elements to keep as raw HTML in the Markdown output
  // (useful for tags with no Markdown equivalent). Each entry
  // is a tag name string or a predicate function.
  keepElements: ["details", "summary", "video"],

  // Post-process the generated Markdown. Receives the Markdown
  // string and the relative file path. Return the final string.
  transform: (md, file) => {
    const slug = file.replace(/\/index\.html$/, "").replace(/\.html$/, "");
    return `---\nslug: ${slug}\n---\n\n${md}`;
  },
});
```

| Option           | Type                          | Default                        | Description                                    |
| ---------------- | ----------------------------- | ------------------------------ | ---------------------------------------------- |
| `exclude`        | `string[]`                    | `[]`                           | Glob patterns to skip                          |
| `selectors`      | `string[]`                    | `["main", "article", "body"]`  | Content extraction tags, in priority order     |
| `removeElements` | `(string \| FilterFn)[]`      | `[]`                           | Extra elements to strip (added to built-in list) |
| `keepElements`   | `(string \| FilterFn)[]`      | `[]`                           | Elements to preserve as raw HTML               |
| `transform`      | `function`                    | `undefined`                    | `(markdown, filePath) => string`               |

`FilterFn` is `(node: HTMLElement, options: Options) => boolean` — the same predicate accepted by [Turndown's `remove()`/`keep()`](https://github.com/mixmark-io/turndown#removing-nodes).

## Hosting adapters

The integration handles build-time generation. To serve the right
format based on `Accept: text/markdown`, you need a thin negotiation
layer at the hosting level. Copy the appropriate adapter into your
project:

### Vercel

Install the required peer dependency:

```bash
npm install @vercel/edge
```

Copy `adapters/vercel.ts` to **`middleware.ts`** at your project root.
Add the headers to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)\\.md",
      "headers": [
        { "key": "Content-Type", "value": "text/markdown; charset=utf-8" },
        { "key": "Vary", "value": "Accept" }
      ]
    }
  ]
}
```

### Cloudflare Pages

Copy `adapters/cloudflare.ts` to **`functions/_middleware.ts`** in your
project. No additional config needed.

### Nginx

Merge the snippet from `adapters/nginx.conf` into your server block.

### Other hosts

The pattern is the same everywhere:

1. Check the `Accept` header for `text/markdown`.
2. Rewrite the path from `/page/` to `/page/index.md`.
3. Set `Content-Type: text/markdown` and `Vary: Accept`.

## Usage examples

### Add frontmatter to every page

```js
markdownExport({
  transform: (md, file) => {
    const slug = file.replace(/\/index\.html$/, "").replace(/\.html$/, "");
    const now = new Date().toISOString();
    return `---\nslug: ${slug}\ngenerated: ${now}\n---\n\n${md}`;
  },
});
```

### Skip specific pages

```js
markdownExport({
  exclude: ["404.html", "search/**", "tags/**"],
});
```

### Keep interactive elements as HTML

```js
markdownExport({
  keepElements: ["details", "summary", "video", "iframe"],
});
```

### Strip elements by attribute using a filter function

```js
markdownExport({
  removeElements: [
    (node) => node.getAttribute("aria-hidden") === "true",
    (node) => node.classList?.contains("decorative"),
  ],
});
```

## Running tests

```bash
npm test
```

Uses Node's built-in test runner with native TypeScript support (no extra dependencies required).

## Testing locally

```bash
# Build
npm run build

# Check that .md files exist
find dist -name "*.md" | head -20

# Compare HTML and Markdown
cat dist/blog/hello-world/index.html
cat dist/blog/hello-world/index.md

# After deploying, test content negotiation
curl https://yoursite.com/blog/hello-world/
curl -H "Accept: text/markdown" https://yoursite.com/blog/hello-world/
```

## How it compares to other approaches

| Approach                        | Pros                                                  | Cons                                     |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| **This package (build-time)**   | Zero runtime cost, any host, LLM/AI crawler friendly  | Needs hosting adapter for negotiation    |
| Astro middleware (SSR)          | Dynamic, no build step                                | Requires SSR, adds latency               |
| Parallel `.md` API routes       | Simple, source-faithful                               | Only works for content collection pages  |
| Serving source `.md` directly   | Perfect fidelity                                      | No Markdown for non-collection pages     |

## Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. Please prefix your commits with a type such as `feat:`, `fix:`, `ci:`, `docs:`, `refactor:`, `test:`, or `chore:`.

## Releasing

Releases are published to npm via GitHub Actions when a GitHub Release is published. Packages are signed with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

### Steps

1. Generate the changelog and bump the version:

   ```bash
   npx changelogen@latest --bump
   ```

2. Commit the changes, tag the release, and push:

   ```bash
   git add .
   git commit -m "chore(release): v$(node -p 'require(\"./package.json\").version')"
   git tag "v$(node -p 'require("./package.json").version')"
   git push --follow-tags
   ```

3. Publish a GitHub Release from the new tag — this triggers the publish workflow. (Draft releases do not trigger publishing; the release must be published.)

### Setup (one-time)

1. Create a **granular access token** on [npmjs.com](https://www.npmjs.com/) (Avatar > Access Tokens > Generate New Token > Granular Access Token). Scope it to the `astro-md-content-negotiation` package with **Read and write** permissions.
2. Add the token as a repository secret named `NPM_TOKEN` in GitHub (Settings > Secrets and variables > Actions).

## License

MIT
