import nearley from "nearley";
import grammar from "./grammar.js";
import type { JsonPath } from "./ast.js";

export default function parse(source: string): JsonPath {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  parser.feed(source);
  switch (parser.results.length) {
    case 0:
      throw new Error("Parser did not produce result");
    case 1:
      return parser.results[0];
    default:
      throw new Error(
        [
          "Parser produced ambiguous results",
          ...parser.results.map((result) => JSON.stringify(result)),
        ].join("\n")
      );
  }
}
