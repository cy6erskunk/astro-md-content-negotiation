import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createConverter } from "./index.ts";

describe("createConverter", () => {
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
