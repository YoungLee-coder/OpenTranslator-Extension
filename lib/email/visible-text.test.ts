import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyEmailStreamError,
  pickEmailPayload,
  visiblePlainLength,
} from "./visible-text.ts";

describe("visiblePlainLength", () => {
  it("treats Gmail ZWSP as empty (the old /\\s/ plainLength bug)", () => {
    const zwsp = "\u200b\u200b\u200c";
    assert.ok(zwsp.replace(/\s+/g, " ").trim().length > 0);
    assert.equal(visiblePlainLength(zwsp), 0);
  });

  it("counts real words", () => {
    assert.equal(visiblePlainLength("  Thanks!  "), 7);
  });

  it("treats nbsp-only as empty", () => {
    assert.equal(visiblePlainLength("\u00a0\n  "), 0);
  });
});

describe("pickEmailPayload", () => {
  it("keeps the latest reply when quotes are only the tail", () => {
    const picked = pickEmailPayload(
      { html: "<div>Thanks</div>", text: "Thanks" },
      { html: "<div>Thanks</div><div class='gmail_quote'>old</div>", text: "Thanks old" },
    );
    assert.equal(picked.html, "<div>Thanks</div>");
    assert.equal(picked.plainLength, 6);
  });

  it("falls back to quoted HTML when stripping leaves only ZWSP", () => {
    const picked = pickEmailPayload(
      { html: "<div>\u200b</div>", text: "\u200b" },
      {
        html: '<div class="gmail_quote">Forwarded hello</div>',
        text: "Forwarded hello",
      },
    );
    assert.match(picked.html, /gmail_quote/);
    assert.ok(picked.plainLength > 0);
  });

  it("stays empty when both sides have no visible text", () => {
    const picked = pickEmailPayload(
      { html: "<div>\u200b</div>", text: "\u200b" },
      { html: "<br>", text: "" },
    );
    assert.equal(picked.plainLength, 0);
  });
});

describe("emptyEmailStreamError", () => {
  it("labels a finished empty SSE as 译文为空", () => {
    assert.equal(emptyEmailStreamError("", true), "译文为空");
    assert.equal(emptyEmailStreamError("  \n", true), "译文为空");
  });

  it("labels a truncated stream as incomplete, not empty", () => {
    assert.equal(emptyEmailStreamError("", false), "翻译未完成，请重试");
  });

  it("accepts a real translation", () => {
    assert.equal(emptyEmailStreamError("<p>你好</p>", true), "");
  });
});
