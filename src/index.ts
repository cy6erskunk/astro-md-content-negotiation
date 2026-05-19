import type { AstroIntegration } from "astro";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import fastGlob from "fast-glob";

const { glob } = fastGlob;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MarkdownExportOptions {
  /**
   * Glob patterns (relative to the output directory) to skip.
   *
   * @example ["404.html", "admin/**"]
   * @default []
   */
  exclude?: string[];

  /**
   * HTML element tags to try — in order — when extracting the main
   * content from a page.  The first match wins.  If nothing matches
   * the full document is converted.
   *
   * @default ["main", "article", "body"]
   */
  selectors?: string[];

  /**
   * Extra HTML tag names whose content should be stripped entirely
   * from the Markdown output (on top of the built-in list: nav,
   * footer, header, script, style, noscript, svg).
   *
   * @example ["aside", "form"]
   * @default []
   */
  removeElements?: string[];

  /**
   * HTML tag names that have no Markdown equivalent and should be
   * kept as raw HTML in the output.
   *
   * @example ["details", "summary", "video"]
   * @default []
   */
  keepElements?: string[];

  /**
   * Callback that receives the generated Markdown string and the
   * relative file path.  Return a (possibly modified) string.  Useful
   * for injecting frontmatter or post-processing.
   *
   * @example
   *   transform: (md, file) =>
   *     `---\nsource: ${file}\n---\n\n${md}`
   */
  transform?: (markdown: string, file: string) => string | Promise<string>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SELECTORS = ["main", "article", "body"];

const DEFAULT_REMOVE = [
  "nav",
  "footer",
  "header",
  "script",
  "style",
  "noscript",
  "svg",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function globFiles(pattern: string, cwd: string): Promise<string[]> {
  return glob(pattern, { cwd, ignore: ["**/_*/**"] });
}

export async function createConverter(
  remove: string[],
  keep: string[],
) {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    hr: "---",
  });

  td.use(gfm);

  // Collapse newlines in link text that arise when a block element (e.g. a
  // decorative <div>) lives inside an <a>. Without this, Turndown emits
  // [text\n\n](url) which is invalid Markdown.
  td.addRule("linkFlattenContent", {
    filter: (node) =>
      node.nodeName === "A" &&
      (node as Element).getAttribute("href") !== null,
    replacement: (content, node) => {
      const href = (node as Element).getAttribute("href") ?? "";
      const title = (node as Element).getAttribute("title");
      const flat = content.replace(/\s*\n+\s*/g, " ").trim();
      if (!flat) return href;
      return title
        ? `[${flat}](${href} "${title}")`
        : `[${flat}](${href})`;
    },
  });

  // Cast to satisfy Turndown's Filter type which expects
  // (keyof HTMLElementTagNameMap)[] — our strings may include
  // custom element names that aren't in the built-in map.
  td.remove(remove as TurndownService.Filter);

  if (keep.length > 0) {
    td.keep(keep as TurndownService.Filter);
  }

  // Improved fenced code block handling — preserves language class.
  td.addRule("fencedCodeBlock", {
    filter: (node: Element) =>
      node.nodeName === "PRE" && node.querySelector("code") !== null,
    replacement: (_content: string, node: Element) => {
      const code = node.querySelector("code");
      const lang =
        code
          ?.getAttribute("class")
          ?.replace(/^language-/, "")
          ?.split(" ")[0] ?? "";
      const text = code?.textContent ?? "";
      return `\n\`\`\`${lang}\n${text.replace(/\n$/, "")}\n\`\`\`\n`;
    },
  });

  return td;
}

function extractMainContent(html: string, selectors: string[]): string {
  for (const tag of selectors) {
    // Match the outermost occurrence of <tag …>…</tag> (non-greedy
    // across newlines).  Good enough for build-generated HTML.
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = html.match(re);
    if (m) return m[1];
  }
  return html;
}

function isExcluded(file: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const regex = new RegExp(
      "^" + p.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    );
    return regex.test(file);
  });
}

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

/**
 * Astro integration that generates a `.md` sibling for every `.html`
 * file in the build output.
 *
 * ```js
 * // astro.config.mjs
 * import markdownExport from "astro-md-content-negotiation";
 *
 * export default defineConfig({
 *   integrations: [markdownExport()],
 * });
 * ```
 */
export default function markdownExport(
  options: MarkdownExportOptions = {},
): AstroIntegration {
  const {
    exclude = [],
    selectors = DEFAULT_SELECTORS,
    removeElements = [],
    keepElements = [],
    transform,
  } = options;

  const allRemove = [...DEFAULT_REMOVE, ...removeElements];

  return {
    name: "astro-md-content-negotiation",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = dir.pathname;
        const converter = await createConverter(allRemove, keepElements);
        const htmlFiles = await globFiles("**/*.html", outDir);

        let generated = 0;
        let skipped = 0;

        for (const file of htmlFiles) {
          if (isExcluded(file, exclude)) {
            skipped++;
            continue;
          }

          const htmlPath = resolve(outDir, file);
          const mdPath = htmlPath.replace(/\.html$/, ".md");

          const html = await readFile(htmlPath, "utf-8");
          const content = extractMainContent(html, selectors);
          let markdown = converter.turndown(content);

          if (transform) {
            markdown = await transform(markdown, file);
          }

          await writeFile(mdPath, markdown, "utf-8");
          generated++;
        }

        logger.info(
          `Generated ${generated} Markdown file${generated !== 1 ? "s" : ""}` +
            (skipped ? ` (${skipped} excluded)` : ""),
        );
      },
    },
  };
}
