import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createConverter } from "./converter.ts";

describe("createConverter", () => {
  describe("remove option", () => {
    it("strips elements whose tag name is in the remove list", async () => {
      const td = await createConverter(["nav", "footer"], []);
      const html = `<p>Hello</p><nav><a href="/">Home</a></nav><footer>Footer</footer>`;
      const result = td.turndown(html);
      assert.match(result, /Hello/);
      assert.doesNotMatch(result, /Home/);
      assert.doesNotMatch(result, /Footer/);
    });

    it("strips elements matched by a filter function", async () => {
      const filter = (node: HTMLElement) => node.nodeName === "DIV" && node.getAttribute("class") === "ad";
      const td = await createConverter([filter], []);
      const html = `<p>Content</p><div class="ad">Buy now!</div>`;
      const result = td.turndown(html);
      assert.match(result, /Content/);
      assert.doesNotMatch(result, /Buy now!/);
    });
  });

  describe("linkFlattenContent", () => {
    it("flattens a link whose <a> contains a decorative block element", async () => {
      const td = await createConverter([], []);
      const html = `<a class="link-button" href="/services/">
  See our services
  <div class="arrow"></div>
</a>`;
      const result = td.turndown(html);
      assert.match(result, /^\[See our services\]\(\/services\/\)$/);
    });

    it("flattens a link whose <a> contains a <p>", async () => {
      const td = await createConverter([], []);
      const result = td.turndown(`<a href="/about/"><p>About us</p></a>`);
      assert.match(result, /^\[About us\]\(\/about\/\)$/);
    });

    it("leaves a plain text link unchanged", async () => {
      const td = await createConverter([], []);
      const result = td.turndown(`<a href="/contact/">Contact</a>`);
      assert.equal(result, "[Contact](/contact/)");
    });

    it("preserves the title attribute", async () => {
      const td = await createConverter([], []);
      const result = td.turndown(
        `<a href="/faq/" title="Frequently asked questions">FAQ</a>`,
      );
      assert.equal(result, '[FAQ](/faq/ "Frequently asked questions")');
    });
  });
});
