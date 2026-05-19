import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export async function createConverter(
  remove: string[],
  keep: string[],
): Promise<TurndownService> {
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
