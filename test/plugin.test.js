import assert from "node:assert/strict";
import test from "node:test";
import prettier from "prettier";
import plugin from "../index.js";

const format = (source) =>
  prettier.format(source, {
    filepath: "sample.md",
    plugins: [plugin],
  });

test("formats grid tables and converts only pipe tables wider than 120 columns", async () => {
  const atLimit = `| A | B |\n| --- | --- |\n| x | ${"x".repeat(110)} |\n`;
  const overLimit = `| A | B |\n| --- | --- |\n| x | ${"x".repeat(111)} |\n`;
  assert.match(await format(atLimit), /^\|/);
  assert.match(await format(overLimit), /^\+/);
  assert.equal(
    await prettier.format(overLimit, {
      filepath: "sample.md",
      plugins: ["./index.js"],
    }),
    await format(overLimit),
  );

  const rich = `| Name | Detail |\n| :--- | ---: |\n| x | **bold** ~~old~~ ${"word ".repeat(25)} |\n`;
  const converted = await format(rich);
  assert.match(converted, /\*\*bold\*\* ~~old~~/);
  assert.equal(converted, await format(converted));

  const nested = `- Item\n\n  +----+----+\n  | A  | B  |\n  +====+====+\n  | one| two|\n  +----+----+\n`;
  const formatted = await format(nested);
  assert.match(formatted, /^- Item\n\n {2}\+[-+]+\n {2}\|/);
  assert.equal(formatted, await format(formatted));
});
