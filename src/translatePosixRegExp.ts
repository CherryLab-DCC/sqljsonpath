import escapeRegExp from "./escapeRegExp.js";
import moo from "moo";

function unhandled(value: string): never {
  throw new Error(
    `unable to convert posix regular expression ${JSON.stringify(value)}`
  );
}

const common: moo.Rules = {
  space: { match: /\s+/u, lineBreaks: true },
  hash: { match: "#" },
  ClassShorthandEscape: { match: ["\\d", "\\D", "\\s", "\\S", "\\w", "\\W"] },
  EscapedSpecialCharacter: {
    match: /\\[^\p{L}\p{Nl}\p{Nd}]/u, // /\\[\0-/:-@\[-`\{-\x7f]/
    lineBreaks: true,
    value: (value) => escapeRegExp(value.slice(1)),
  },
  BackRefOrCharacterEntryEscape: [
    { match: "\\a", value: () => "\\x07" },
    { match: "\\b", value: () => "\\x08" },
    { match: "\\B", value: () => "\\\\" },
    { match: "\\e", value: () => "\\x1B" },
    { match: ["\\f", "\\n", "\\r", "\\t", "\\v", "\\0"] },
    { match: /\\u[A-Fa-f0-9]{4}/u },
    {
      match: /\\U[A-Fa-f0-9]{8}/u,
      value: (value) => {
        const code = parseInt(value.slice(2), 16);
        // Will throw if invalid
        String.fromCodePoint(code);
        return `\\u{${code.toString(16)}}`;
      },
    },
    {
      match: /\\x[A-Fa-f0-9]+/u,
      value: (value) => {
        if (value.length === 4) {
          return value;
        }
        const code = parseInt(value.slice(2), 16);
        // Will throw if invalid
        String.fromCodePoint(code);
        return `\\u{${code.toString(16)}}`;
      },
    },
    { match: /\\c./u, lineBreaks: true },
    { match: /\\[1-9][0-9]*/u },
    { match: /\\[0-7]{2,3}/u },
  ],
  invalidEscape: {
    match: /\\.?/u,
    lineBreaks: true,
    value: () => {
      throw new Error("invalid escape \\ sequence");
    },
  },
};

const main: moo.Rules = {
  dot: { match: "." },
  ConstraintGroup: { match: ["(?=", "(?!", "(?<=", "(?<!"], push: "group" }, // advanced syntax only
  Group: { match: ["(?:", "("], push: "group" },
  ConstraintEscape: [
    { match: "\\y", value: () => "\\b" },
    { match: "\\Y", value: () => "\\B" },
    { match: ["\\m", "[[:<:]]"], value: () => "\\b(?=\\w)" },
    { match: ["\\M", "[[:>:]]"], value: () => "\\b(?<=\\w)" },
    { match: ["\\A", "\\Z"], value: unhandled },
  ],
  Bracket: { match: ["[^", "["], push: "bracket" },
  Constraint: { match: ["^", "$"] },
  Comment: { match: /\(\?#[^\)]*\)/u, lineBreaks: true, value: () => "" },
  InvalidQuantifierOperand: {
    match: "(?",
    value: () => {
      throw new Error("quantifier operand invalid");
    },
  },
  Quantifier: [
    { match: /[\*\+\?](?:\??)/u },
    { match: /\{\d+(?:,(?:\d+)?)?\}(?:\??)/u },
  ],
  //nonBound: { match: /\{(?!\d)/ },
  InvalidBound: { match: "{", value: unhandled },
  other: /[^\\\s#\[\]\(\)\{\}\+\*\?\.\^\$\-]+/u,
  ...common,
};

const group: moo.Rules = {
  CloseGroup: { match: ")", pop: 1 },
  ...main,
};
const bracket: moo.Rules = {
  FirstBracket: { match: /\](?<=\[\^?)/u, value: () => "\\]" },
  CloseBracket: { match: "]", pop: 1 },
  CharacterClass: [
    // https://www.regular-expressions.info/posixbrackets.html
    { match: "[:alnum:]", value: () => "\\p{L}\\p{Nl}\\p{Nd}" },
    { match: "[:alpha:]", value: () => "\\p{L}\\p{Nl}" },
    { match: "[:ascii:]", value: () => "\\p{InBasicLatin}" },
    { match: "[:blank:]", value: () => "\\p{Zs}\\t" },
    { match: "[:cntrl:]", value: () => "\\p{Cc}" },
    { match: "[:digit:]", value: () => "\\p{Nd}" },
    { match: "[:graph:]", value: () => "\\x21-\\x7E" }, // '^\\p{Z}\\p{C}'
    { match: "[:lower:]", value: () => "\\p{Ll}" },
    { match: "[:print:]", value: () => "\\P{C}" },
    { match: "[:punct:]", value: () => "\\p{P}" },
    { match: "[:space:]", value: () => "\\p{Z}\\t\\r\\n\\v\\f" },
    { match: "[:upper:]", value: () => "\\p{Lu}" },
    { match: "[:word:]", value: () => "\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}" },
    { match: "[:xdigit:]", value: () => "A-Fa-f0-9" },
    { match: /\[:.*?:\]/u, value: unhandled },
  ],
  CollatingElement: [
    { match: /\[\..\.\]/u, value: (value) => escapeRegExp(value.slice(2, 3)) },
    { match: /\[\..*?\.\]/u, value: unhandled },
  ],
  EquivalenceClass: { match: /\[=.*?=\]/u, value: unhandled },
  nestedBracket: { match: "[", value: unhandled },
  Range: { match: /-/u },
  other: /[^\\\s\[\]\-]+/u,
  ...common,
};

export const lexer: moo.Lexer = moo.states({ main, group, bracket });

export default function translatePosixRegExp(
  pattern: string,
  flags: string = ""
): RegExp {
  let ignoreCase = false;
  let dotAll = true;
  let multiline = false;
  let expanded = false;
  let quoted = false;
  let syntax: "advanced" | "basic" | "extended" = "advanced";
  if (pattern.startsWith("***=")) {
    pattern = pattern.slice(4);
    quoted = true;
  } else if (pattern.startsWith("***")) {
    pattern = pattern.slice(3);
    syntax = "advanced";
  }
  const matchEmbeddedOptions = quoted
    ? null
    : /^\(\?([A-Za-z]+)\)/.exec(pattern);
  for (const option of flags + (matchEmbeddedOptions?.[1] ?? "")) {
    switch (option) {
      case "b":
        syntax = "basic";
        break;
      case "c":
        ignoreCase = false;
        break;
      case "e":
        syntax = "extended";
        break;
      case "i":
        ignoreCase = true;
        break;
      case "m":
      case "n":
        dotAll = true;
        multiline = true;
        break;
      case "p":
        dotAll = true;
        multiline = false;
        break;
      case "q":
        quoted = true;
        break;
      case "s":
        dotAll = false;
        multiline = false;
        break;
      case "t":
        expanded = false;
        break;
      case "w":
        dotAll = false;
        multiline = true;
        break;
      case "x":
        expanded = true;
        break;
      default:
        throw new Error(`unknown flag ${JSON.stringify(option)}`);
    }
  }
  if (quoted) {
    return new RegExp(escapeRegExp(pattern), flags);
  }
  if (expanded) {
    throw new Error(
      '"x" flag (expanded regular expressions) is not implemented'
    );
  }
  if (syntax === "basic") {
    throw new Error('"b" flag (basic regular expressions) is not implemented');
  }
  if (syntax === "extended") {
    throw new Error(
      '"e" flag (extended regular expressions) is not implemented'
    );
  }
  const translated = Array.from(lexer.reset(pattern)).join("");
  const translatedFlags =
    (ignoreCase ? "i" : "") +
    (dotAll ? "s" : "") +
    (multiline ? "m" : "") +
    "u";
  return new RegExp(translated, translatedFlags);
}

export function posixFlagsFromLikeRegex(likeRegexFlags: string = ""): string {
  let ignoreCase = false;
  let dotAll = false;
  let multiline = false;
  let expanded = false;
  let quoted = false;
  for (const option of likeRegexFlags) {
    switch (option) {
      case "i":
        ignoreCase = true;
        break;
      case "s":
        dotAll = true;
        break;
      case "m":
        multiline = true;
        break;
      case "x":
        expanded = true;
        break;
      case "q":
        quoted = true;
        break;
      default:
        throw new Error(`unknown flag ${JSON.stringify(option)}`);
    }
  }
  if (expanded) {
    throw new Error(
      'XQuery "x" flag (expanded regular expressions) is not implemented'
    );
  }
  return (
    (quoted ? "q" : "") +
    (ignoreCase ? "i" : "") +
    (dotAll ? (multiline ? "n" : "p") : multiline ? "w" : "s")
  );
}

export function old(posix: string): RegExp {
  const translated = posix.replace(
    /\\(?:U[0-9a-fA-F]{8}|x[0-9a-fA-F]+|[aAbBemMyYZ])|\[\:(?:alnum|alpha|ascii|blank|cntrl|digit|graph|lower|print|punct|space|upper|word|xdigit)\:\]/g,
    (match) => {
      if (match[0] === "\\") {
        switch (match[1]) {
          //  Regular Expression Class-Shorthand Escapes
          // XXX these only match ASCII in JS but unicode in posix
          case "d":
          case "D":
          case "s":
          case "S":
          case "w":
          case "W":
            return match;

          case "U":
            return `\\u${match.slice(2, 6)}\\u${match.slice(6, 10)}`;
          case "x":
            return match.length === 4
              ? match
              : escapeRegExp(
                  String.fromCodePoint(parseInt(match.slice(2), 16))
                );
          case "a":
            return "\\x07";
          case "b":
            return "\\x08";
          case "B":
            return "\\\\";
          case "e":
            return "\\x1B";

          case "y":
            return "\\b";
          case "Y":
            return "\\B";
          case "A":
          case "m":
          case "M":
          case "Z":
          default:
            break;
        }
      } else {
        // https://www.regular-expressions.info/posixbrackets.html
        // These should only be changed in brackets...
        switch (match) {
          case "[:alnum:]":
            return "\\p{L}\\p{Nl}\\p{Nd}";
          case "[:alpha:]":
            return "\\p{L}\\p{Nl}";
          case "[:ascii:]":
            return "\\p{InBasicLatin}";
          case "[:blank:]":
            return "\\p{Zs}\\t";
          case "[:cntrl:]":
            return "\\p{Cc}";
          case "[:digit:]":
            return "\\p{Nd}";
          case "[:graph:]":
            return "^\\p{Z}p{C}"; // '\\x21-\\x7E'
          case "[:lower:]":
            return "\\p{Ll}";
          case "[:print:]":
            return "\\P{C}";
          case "[:punct:]":
            return "\\p{P}";
          case "[:space:]":
            return "\\p{Z}\\t\\r\\n\\v\\f";
          case "[:upper:]":
            return "\\p{Lu}";
          case "[:word:]":
            return "\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}";
          case "[:xdigit:]":
            return "A-Fa-f0-9";
          default:
            break;
        }
      }
      throw new Error(`unable to translate posix regular expression: ${match}`);
    }
  );
  return new RegExp(translated);
}
