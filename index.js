import {
  gridTablesFromMarkdown,
  gridTablesToMarkdown,
} from "@adobe/mdast-util-gridtables";
import { gridTables } from "@adobe/micromark-extension-gridtables";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import prettier from "prettier";
import markdown from "prettier/plugins/markdown.js";
import stringWidth from "string-width";

const MAX_PIPE_TABLE_WIDTH = 120; // grid table with is hardcoded in mdast-util-gridtables

const originalPrinter = markdown.printers.mdast;
const { hardline, join } = prettier.doc.builders;

const gridDoc = (text) => join(hardline, text.split("\n"));

function visit(node, fn) {
  fn(node);
  for (const child of node.children ?? []) visit(child, fn);
}

function asGrid(table) {
  const rows = table.children;
  const columns = rows[0]?.children.length;
  if (!columns || rows.some((row) => row.children.length !== columns)) return;

  const row = (source) => ({
    type: "gtRow",
    children: source.children.map((cell, i) => ({
      type: "gtCell",
      align: table.align?.[i],
      children: cell.children,
    })),
  });
  const grid = {
    type: "gridTable",
    children: [
      { type: "gtHeader", children: [row(rows[0])] },
      { type: "gtBody", children: rows.slice(1).map(row) },
    ],
  };
  return toMarkdown(
    { type: "root", children: [grid] },
    {
      extensions: [gfmToMarkdown(), gridTablesToMarkdown()],
    },
  ).trimEnd();
}

function parse(text, options) {
  const ast = markdown.parsers.markdown.parse(text, options);
  const paragraphs = new Map();
  visit(ast, (node) => {
    if (node.type === "paragraph") {
      paragraphs.set(
        `${node.position.start.offset}:${node.position.end.offset}`,
        node,
      );
    } else if (node.type === "table") {
      node.gridTableSource = structuredClone(node);
    }
  });

  if (text.includes("+")) {
    const gridOptions = { extensions: [gridTables], mdastExtensions: [] };
    gridOptions.mdastExtensions.push(gridTablesFromMarkdown(gridOptions));
    const parsed = fromMarkdown(text, gridOptions);
    visit(parsed, (node) => {
      if (node.type !== "gridTable") return;
      const key = `${node.position.start.offset}:${node.position.end.offset}`;
      const paragraph = paragraphs.get(key);
      if (paragraph) {
        paragraph.gridTableOutput = toMarkdown(
          { type: "root", children: [node] },
          { extensions: [gridTablesToMarkdown()] },
        ).trimEnd();
      }
    });
  }
  return ast;
}

function print(path, options, recurse) {
  const { node } = path;
  if (node.type === "paragraph" && node.gridTableOutput) {
    return gridDoc(node.gridTableOutput);
  }

  const standard = originalPrinter.print(path, options, recurse);
  if (node.type !== "table" || !node.gridTableSource) return standard;

  const aligned = prettier.doc.printer.printDocToString(standard, {
    ...options,
    printWidth: Number.POSITIVE_INFINITY,
    endOfLine: "lf",
  }).formatted;
  if (
    !aligned
      .split("\n")
      .some((line) => stringWidth(line) > MAX_PIPE_TABLE_WIDTH)
  ) {
    return standard;
  }
  const grid = asGrid(node.gridTableSource);
  return grid ? gridDoc(grid) : standard;
}

export const languages = markdown.languages;
export const parsers = {
  markdown: { ...markdown.parsers.markdown, parse },
};
export const printers = {
  mdast: { ...originalPrinter, print },
};

export default { languages, parsers, printers };
