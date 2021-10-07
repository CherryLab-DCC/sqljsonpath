import moo from "moo";

const special = Array.from("?%$.[]{}()|&!=<>@#,*:-+/");
const blank = /[ \t\n\r\f]+/;
/* "other" means anything that's not special, blank, or '\' or '"' */
const other =
  /[^\?\%\$\.\[\]\{\}\(\)\|\&\!\=\<\>\@\#\,\*:\-\+\/\\\" \t\n\r\f]+/;

const UNESCAPES: { [k: string]: string } = {
  "\\b": "\b",
  "\\f": "\f",
  "\\n": "\n",
  "\\r": "\r",
  "\\t": "\t",
  "\\v": "\v",
};

const escaped: moo.Rule[] = [
  {
    match: /\\[^xu]/,
    value: (s) => UNESCAPES[s] || s.slice(1),
    lineBreaks: true,
  },
  {
    match: /\\x[0-9A-Fa-f]{2}/,
    value: (s) => String.fromCodePoint(parseInt(s.slice(2), 16)),
  },
  {
    match: /\\u[0-9A-Fa-f]{4}/,
    value: (s) => String.fromCodePoint(parseInt(s.slice(2), 16)),
  },
  {
    match: /\\u\{[0-9A-Fa-f]{1,6}\}/,
    value: (s) => String.fromCodePoint(parseInt(s.slice(3, -1), 16)),
  },
];

const escapedfail: moo.Rule = {
  match: "\\",
  //match: /\\(?:(?:u(?:[0-9A-Fa-f]{0,3}|\{[0-9A-Fa-f]{0,6})/)|(?:x[0-9A-Fa-f]{0,1}))?/,
};

const caseInsensitiveKeywords = moo.keywords({
  is: "is",
  to: "to",
  abs: "abs",
  lax: "lax",
  flag: "flag",
  last: "last",
  size: "size",
  type: "type",
  with: "with",
  floor: "floor",
  double: "double",
  exists: "exists",
  starts: "starts",
  strict: "strict",
  ceiling: "ceiling",
  unknown: "unknown",
  datetime: "datetime",
  keyvalue: "keyvalue",
  like_regex: "like_regex",
});

const caseSensitiveKeywords = moo.keywords({
  null: "null",
  true: "true",
  false: "false",
});

const lexer = moo.states({
  main: {
    // XXX Why does this miss '\v'? Postgres bug or part of spec?
    // \v and \0 escapes are not allowed in json strings.
    blank: { match: blank, lineBreaks: true },
    comp_op: [
      { match: "<>", value: () => "!=" },
      { match: ["!=", "<=", "==", ">=", "<", ">"] },
    ],
    and: "&&",
    or: "||",
    not: "!",
    any: "**",
    numeric: /(?:[0]|[1-9][0-9]*)(?:\.[0-9]+)(?:[eE][-+]?[0-9]+)?/,
    intexp: /(?:[0]|[1-9][0-9]*)(?:[eE][-+]?[0-9]+)/,
    int: /[0]|[1-9][0-9]*/,
    numberfail: /(?:[0]|[1-9][0-9]*)(?:\.[0-9]+)?[eE][-+]?/,
    variable: {
      match: new RegExp(/\$/.source + other.source),
      value: (s) => s.slice(1),
    },
    startxvq: { match: '$"', push: "xvq" },
    startxc: { match: "/*", push: "xc" },
    startxq: { match: '"', push: "xq" },
    ident: [
      ...escaped,
      {
        match: other,
        type: (text) =>
          caseSensitiveKeywords(text) ||
          caseInsensitiveKeywords(text.toLowerCase()),
      },
    ],
    escapedfail,
    special,
  },
  xq: {
    string: [...escaped, { match: /[^\\\"]+/, lineBreaks: true }],
    escapedfail,
    endxq: { match: '"', pop: 1 },
  },
  xvq: {
    varq: [...escaped, { match: /[^\\\"]+/, lineBreaks: true }],
    escapedfail,
    endxvq: { match: '"', pop: 1 },
  },
  xc: {
    endxc: { match: "*/", pop: 1 },
    xcbody: [{ match: /\*[^\/]/ }, { match: /[^\*]+/, lineBreaks: true }],
  },
});

export default lexer;
