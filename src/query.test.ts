import { compile, query, query_first, exists, match } from "./index.js";
import type { Json } from "./ast.js";

// Not sure how useful this really is.
// If JSON comes from many objects how can we make it consistent?
// We soon run into limitations of Number.MAX_SAFE_INTEGER.
function makeKeyValueIdReviver(
  weakmap: WeakMap<object, number>,
  start: number = 0
): (key: string, value: Json) => Json {
  let id = start;
  return (_key, value) => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      weakmap.set(value, id++);
    }
    return value;
  };
}

function normalize(obj: Json): Json {
  switch (typeof obj) {
    case "string":
    case "boolean":
      return obj;
    case "number":
      return Number(obj.toPrecision(10));
    default:
      if (obj === null) {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(normalize);
      }
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, normalize(v)])
      );
  }
}

// Handle these in compile
const disallowed = [
  ["last", "LAST is allowed only in array subscripts"],
  ["@", "@ is not allowed in root expressions"],
  ["$ ? (last > 0)", "LAST is allowed only in array subscripts"],
  ['$ ? (@ like_regex "(invalid pattern")', "Invalid regular expression"],
  [
    '$ ? (@ like_regex "pattern" flag "xsms")',
    'XQuery "x" flag (expanded regular expressions) is not implemented',
  ],
  ["@ + 1", "@ is not allowed in root expressions"],
];
describe("disallowed", () => {
  test.each(disallowed)("%s", (testpath, error) => {
    expect(() => compile(testpath)).toThrowError(error);
  });
});

/*
const examples: Array<[Json[], string, Json, {[key:string]: Json} | null]> = [
  [[{"a": 10}], '$ ? (@.a < $value)', {"a": 10}, {value: 13}],
  //[[12], "$.a", {"a": 12, "b": {"a": 13}}],
  //[[], "lax $[0].a", [12, { a: 13 }, { b: 14 }]],
  //[[12] "$.*.a", { a: { a: 12 } }],
  //[[12] "$.a.a", { a: { a: 12 } }],
  //[[12], "strict $.a", { a: 12 }],
  //[[true, true], "$[*]", [true, true]],
  //[[12], "$.a", { a: 12, b: { a: 13 } }],
  //[[{ a: 13 }, { b: 14 }, "ccc"], "$[2.5 - 1 to $.size() - 2]", [12, { a: 13 }, { b: 14 }, "ccc", true]],
  //[[{ x: 2 }],"lax $.g ? (exists (@.x))",{ g: [{ x: 2 }, { y: 3 }] }],
  //[[{ x: 2 }],"lax $.g ? (exists (@.x))", { g: [{ x: 2 }, { y: 3 }] }],
  //[["2017-03-10T12:34:56+03:10"], '$.datetime()', "2017-03-10 12:34:56+3:10"],
  //[["^a\\b$"], 'lax $[*] ? (@ like_regex "^a\\\\B$" flag "iq")', [null, 1, "a\b", "a\\b", "^a\\b$"]],
  //[["a\b"], 'lax $[*] ? (@ like_regex "a\\\\b" flag "")', [null, 1, "a\b", "a\\b", "^a\\b$"]],
  //[["a"], '$[0]', ["a"]],
  //[ [{"x": 2}, {"y": 3}], 'lax $.g ? ((exists (@.x + "3")) is unknown)', {"g": [{"x": 2}, {"y": 3}]}],
];
test.only.each(examples)("%j %s", (expected, path, root, vars) => {
  const parsed = parse(path);
  const actual = Array.from(query(parsed, root, vars));
  expect(actual).toEqual(expected);
});
*/
// (_sql, expected, path, root, vars)
const jsonb_path_query: Array<
  [string, Json[], string, Json, { [key: string]: Json } | null]
> = [
  [`select jsonb_path_query('1', 'lax $.a');`, [], "lax $.a", 1, null],
  [`select jsonb_path_query('[]', 'lax $.a');`, [], "lax $.a", [], null],
  [`select jsonb_path_query('{}', 'lax $.a');`, [], "lax $.a", {}, null],
  [
    `select jsonb_path_query('{"a": 12, "b": {"a": 13}}', '$.a');`,
    [12],
    "$.a",
    { a: 12, b: { a: 13 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": 12, "b": {"a": 13}}', '$.b');`,
    [{ a: 13 }],
    "$.b",
    { a: 12, b: { a: 13 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": 12, "b": {"a": 13}}', '$.*');`,
    [12, { a: 13 }],
    "$.*",
    { a: 12, b: { a: 13 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": 12, "b": {"a": 13}}', 'lax $.*.a');`,
    [13],
    "lax $.*.a",
    { a: 12, b: { a: 13 } },
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[*].a');`,
    [13],
    "lax $[*].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[*].*');`,
    [13, 14],
    "lax $[*].*",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[0].a');`,
    [],
    "lax $[0].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[1].a');`,
    [13],
    "lax $[1].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[2].a');`,
    [],
    "lax $[2].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[0,1].a');`,
    [13],
    "lax $[0,1].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[0 to 10].a');`,
    [13],
    "lax $[0 to 10].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}, "ccc", true]', '$[2.5 - 1 to $.size() - 2]');`,
    [{ a: 13 }, { b: 14 }, "ccc"],
    "$[2.5 - 1 to $.size() - 2]",
    [12, { a: 13 }, { b: 14 }, "ccc", true],
    null,
  ],
  [`select jsonb_path_query('1', 'lax $[0]');`, [1], "lax $[0]", 1, null],
  [`select jsonb_path_query('1', 'lax $[*]');`, [1], "lax $[*]", 1, null],
  [`select jsonb_path_query('[1]', 'lax $[0]');`, [1], "lax $[0]", [1], null],
  [`select jsonb_path_query('[1]', 'lax $[*]');`, [1], "lax $[*]", [1], null],
  [
    `select jsonb_path_query('[1,2,3]', 'lax $[*]');`,
    [1, 2, 3],
    "lax $[*]",
    [1, 2, 3],
    null,
  ],
  [`select jsonb_path_query('[]', '$[last]');`, [], "$[last]", [], null],
  [
    `select jsonb_path_query('[]', '$[last ? (exists(last))]');`,
    [],
    "$[last ? (exists(last))]",
    [],
    null,
  ],
  [`select jsonb_path_query('[1]', '$[last]');`, [1], "$[last]", [1], null],
  [
    `select jsonb_path_query('[1,2,3]', '$[last]');`,
    [3],
    "$[last]",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1,2,3]', '$[last - 1]');`,
    [2],
    "$[last - 1]",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1,2,3]', '$[last ? (@.type() == "number")]');`,
    [3],
    '$[last ? (@.type() == "number")]',
    [1, 2, 3],
    null,
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$');`,
    [{ a: 10 }],
    "$",
    { a: 10 },
    null,
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)', '{"value" : 13}');`,
    [{ a: 10 }],
    "$ ? (@.a < $value)",
    { a: 10 },
    { value: 13 },
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)', '{"value" : 8}');`,
    [],
    "$ ? (@.a < $value)",
    { a: 10 },
    { value: 8 },
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$.a ? (@ < $value)', '{"value" : 13}');`,
    [10],
    "$.a ? (@ < $value)",
    { a: 10 },
    { value: 13 },
  ],
  [
    `select * from jsonb_path_query('[10,11,12,13,14,15]', '$[*] ? (@ < $value)', '{"value" : 13}');`,
    [10, 11, 12],
    "$[*] ? (@ < $value)",
    [10, 11, 12, 13, 14, 15],
    { value: 13 },
  ],
  [
    `select * from jsonb_path_query('[10,11,12,13,14,15]', '$[0,1] ? (@ < $x.value)', '{"x": {"value" : 13}}');`,
    [10, 11],
    "$[0,1] ? (@ < $x.value)",
    [10, 11, 12, 13, 14, 15],
    { x: { value: 13 } },
  ],
  [
    `select * from jsonb_path_query('[10,11,12,13,14,15]', '$[0 to 2] ? (@ < $value)', '{"value" : 15}');`,
    [10, 11, 12],
    "$[0 to 2] ? (@ < $value)",
    [10, 11, 12, 13, 14, 15],
    { value: 15 },
  ],
  [
    `select * from jsonb_path_query('[1,"1",2,"2",null]', '$[*] ? (@ == "1")');`,
    ["1"],
    '$[*] ? (@ == "1")',
    [1, "1", 2, "2", null],
    null,
  ],
  [
    `select * from jsonb_path_query('[1,"1",2,"2",null]', '$[*] ? (@ == $value)', '{"value" : "1"}');`,
    ["1"],
    "$[*] ? (@ == $value)",
    [1, "1", 2, "2", null],
    { value: "1" },
  ],
  [
    `select * from jsonb_path_query('[1,"1",2,"2",null]', '$[*] ? (@ == $value)', '{"value" : null}');`,
    [null],
    "$[*] ? (@ == $value)",
    [1, "1", 2, "2", null],
    { value: null },
  ],
  [
    `select * from jsonb_path_query('[1, "2", null]', '$[*] ? (@ != null)');`,
    [1, "2"],
    "$[*] ? (@ != null)",
    [1, "2", null],
    null,
  ],
  [
    `select * from jsonb_path_query('[1, "2", null]', '$[*] ? (@ == null)');`,
    [null],
    "$[*] ? (@ == null)",
    [1, "2", null],
    null,
  ],
  [
    `select * from jsonb_path_query('{}', '$ ? (@ == @)');`,
    [],
    "$ ? (@ == @)",
    {},
    null,
  ],
  [
    `select * from jsonb_path_query('[]', 'strict $ ? (@ == @)');`,
    [],
    "strict $ ? (@ == @)",
    [],
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**');`,
    [{ a: { b: 1 } }, { b: 1 }, 1],
    "lax $.**",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{0}');`,
    [{ a: { b: 1 } }],
    "lax $.**{0}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{0 to last}');`,
    [{ a: { b: 1 } }, { b: 1 }, 1],
    "lax $.**{0 to last}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{1}');`,
    [{ b: 1 }],
    "lax $.**{1}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{1 to last}');`,
    [{ b: 1 }, 1],
    "lax $.**{1 to last}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{2}');`,
    [1],
    "lax $.**{2}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{2 to last}');`,
    [1],
    "lax $.**{2 to last}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{3 to last}');`,
    [],
    "lax $.**{3 to last}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{last}');`,
    [1],
    "lax $.**{last}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**.b ? (@ > 0)');`,
    [1],
    "lax $.**.b ? (@ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{0}.b ? (@ > 0)');`,
    [],
    "lax $.**{0}.b ? (@ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{1}.b ? (@ > 0)');`,
    [1],
    "lax $.**{1}.b ? (@ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{0 to last}.b ? (@ > 0)');`,
    [1],
    "lax $.**{0 to last}.b ? (@ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{1 to last}.b ? (@ > 0)');`,
    [1],
    "lax $.**{1 to last}.b ? (@ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"b": 1}}', 'lax $.**{1 to 2}.b ? (@ > 0)');`,
    [1],
    "lax $.**{1 to 2}.b ? (@ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**.b ? (@ > 0)');`,
    [1],
    "lax $.**.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**{0}.b ? (@ > 0)');`,
    [],
    "lax $.**{0}.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**{1}.b ? (@ > 0)');`,
    [],
    "lax $.**{1}.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**{0 to last}.b ? (@ > 0)');`,
    [1],
    "lax $.**{0 to last}.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**{1 to last}.b ? (@ > 0)');`,
    [1],
    "lax $.**{1 to last}.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**{1 to 2}.b ? (@ > 0)');`,
    [1],
    "lax $.**{1 to 2}.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"a": {"c": {"b": 1}}}', 'lax $.**{2 to 3}.b ? (@ > 0)');`,
    [1],
    "lax $.**{2 to 3}.b ? (@ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_query('{"g": {"x": 2}}', '$.g ? (exists (@.x))');`,
    [{ x: 2 }],
    "$.g ? (exists (@.x))",
    { g: { x: 2 } },
    null,
  ],
  [
    `select jsonb_path_query('{"g": {"x": 2}}', '$.g ? (exists (@.y))');`,
    [],
    "$.g ? (exists (@.y))",
    { g: { x: 2 } },
    null,
  ],
  [
    `select jsonb_path_query('{"g": {"x": 2}}', '$.g ? (exists (@.x ? (@ >= 2) ))');`,
    [{ x: 2 }],
    "$.g ? (exists (@.x ? (@ >= 2) ))",
    { g: { x: 2 } },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'lax $.g ? (exists (@.x))');`,
    [{ x: 2 }],
    "lax $.g ? (exists (@.x))",
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'lax $.g ? (exists (@.x + "3"))');`,
    [],
    'lax $.g ? (exists (@.x + "3"))',
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'lax $.g ? ((exists (@.x + "3")) is unknown)');`,
    [{ x: 2 }, { y: 3 }],
    'lax $.g ? ((exists (@.x + "3")) is unknown)',
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'strict $.g[*] ? (exists (@.x))');`,
    [{ x: 2 }],
    "strict $.g[*] ? (exists (@.x))",
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'strict $.g[*] ? ((exists (@.x)) is unknown)');`,
    [{ y: 3 }],
    "strict $.g[*] ? ((exists (@.x)) is unknown)",
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'strict $.g ? (exists (@[*].x))');`,
    [],
    "strict $.g ? (exists (@[*].x))",
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"g": [{"x": 2}, {"y": 3}]}', 'strict $.g ? ((exists (@[*].x)) is unknown)');`,
    [[{ x: 2 }, { y: 3 }]],
    "strict $.g ? ((exists (@[*].x)) is unknown)",
    { g: [{ x: 2 }, { y: 3 }] },
    null,
  ],
  [
    `select jsonb_path_query('{"c": {"a": 2, "b":1}}', '$.** ? (@.a == 1 + 1)');`,
    [{ a: 2, b: 1 }],
    "$.** ? (@.a == 1 + 1)",
    { c: { a: 2, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"c": {"a": 2, "b":1}}', '$.** ? (@.a == (1 + 1))');`,
    [{ a: 2, b: 1 }],
    "$.** ? (@.a == (1 + 1))",
    { c: { a: 2, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"c": {"a": 2, "b":1}}', '$.** ? (@.a == @.b + 1)');`,
    [{ a: 2, b: 1 }],
    "$.** ? (@.a == @.b + 1)",
    { c: { a: 2, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('{"c": {"a": 2, "b":1}}', '$.** ? (@.a == (@.b + 1))');`,
    [{ a: 2, b: 1 }],
    "$.** ? (@.a == (@.b + 1))",
    { c: { a: 2, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_query('[1,2,0,3]', '$[*] ? (2 / @ > 0)');`,
    [1, 2, 3],
    "$[*] ? (2 / @ > 0)",
    [1, 2, 0, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1,2,0,3]', '$[*] ? ((2 / @ > 0) is unknown)');`,
    [0],
    "$[*] ? ((2 / @ > 0) is unknown)",
    [1, 2, 0, 3],
    null,
  ],
  [
    `select jsonb_path_query('{"a": [2]}', 'lax $.a * 3');`,
    [6],
    "lax $.a * 3",
    { a: [2] },
    null,
  ],
  [
    `select jsonb_path_query('{"a": [2]}', 'lax $.a + 3');`,
    [5],
    "lax $.a + 3",
    { a: [2] },
    null,
  ],
  [
    `select jsonb_path_query('{"a": [2, 3, 4]}', 'lax -$.a');`,
    [-2, -3, -4],
    "lax -$.a",
    { a: [2, 3, 4] },
    null,
  ],
  [`select jsonb_path_query('2', '$ > 1');`, [true], "$ > 1", 2, null],
  [`select jsonb_path_query('2', '$ <= 1');`, [false], "$ <= 1", 2, null],
  [`select jsonb_path_query('2', '$ == "2"');`, [null], '$ == "2"', 2, null],
  [
    `select jsonb_path_query('[null,1,true,"a",[],{}]', '$.type()');`,
    ["array"],
    "$.type()",
    [null, 1, true, "a", [], {}],
    null,
  ],
  [
    `select jsonb_path_query('[null,1,true,"a",[],{}]', 'lax $.type()');`,
    ["array"],
    "lax $.type()",
    [null, 1, true, "a", [], {}],
    null,
  ],
  [
    `select jsonb_path_query('[null,1,true,"a",[],{}]', '$[*].type()');`,
    ["null", "number", "boolean", "string", "array", "object"],
    "$[*].type()",
    [null, 1, true, "a", [], {}],
    null,
  ],
  [
    `select jsonb_path_query('null', 'null.type()');`,
    ["null"],
    "null.type()",
    null,
    null,
  ],
  [
    `select jsonb_path_query('null', 'true.type()');`,
    ["boolean"],
    "true.type()",
    null,
    null,
  ],
  [
    `select jsonb_path_query('null', '(123).type()');`,
    ["number"],
    "(123).type()",
    null,
    null,
  ],
  [
    `select jsonb_path_query('null', '"123".type()');`,
    ["string"],
    '"123".type()',
    null,
    null,
  ],
  [
    `select jsonb_path_query('{"a": 2}', '($.a - 5).abs() + 10');`,
    [13],
    "($.a - 5).abs() + 10",
    { a: 2 },
    null,
  ],
  [
    `select jsonb_path_query('{"a": 2.5}', '-($.a * $.a).floor() % 4.3');`,
    [-1.7],
    "-($.a * $.a).floor() % 4.3",
    { a: 2.5 },
    null,
  ],
  [
    `select jsonb_path_query('[1, 2, 3]', '($[*] > 2) ? (@ == true)');`,
    [true],
    "($[*] > 2) ? (@ == true)",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1, 2, 3]', '($[*] > 3).type()');`,
    ["boolean"],
    "($[*] > 3).type()",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1, 2, 3]', '($[*].a > 3).type()');`,
    ["boolean"],
    "($[*].a > 3).type()",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1, 2, 3]', 'strict ($[*].a > 3).type()');`,
    ["null"],
    "strict ($[*].a > 3).type()",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[1,null,true,"11",[],[1],[1,2,3],{},{"a":1,"b":2}]', 'lax $[*].size()');`,
    [1, 1, 1, 1, 0, 1, 3, 1, 1],
    "lax $[*].size()",
    [1, null, true, "11", [], [1], [1, 2, 3], {}, { a: 1, b: 2 }],
    null,
  ],
  [
    `select jsonb_path_query('[0, 1, -2, -3.4, 5.6]', '$[*].abs()');`,
    [0, 1, 2, 3.4, 5.6],
    "$[*].abs()",
    [0, 1, -2, -3.4, 5.6],
    null,
  ],
  [
    `select jsonb_path_query('[0, 1, -2, -3.4, 5.6]', '$[*].floor()');`,
    [0, 1, -2, -4, 5],
    "$[*].floor()",
    [0, 1, -2, -3.4, 5.6],
    null,
  ],
  [
    `select jsonb_path_query('[0, 1, -2, -3.4, 5.6]', '$[*].ceiling()');`,
    [0, 1, -2, -3, 6],
    "$[*].ceiling()",
    [0, 1, -2, -3.4, 5.6],
    null,
  ],
  [
    `select jsonb_path_query('[0, 1, -2, -3.4, 5.6]', '$[*].ceiling().abs()');`,
    [0, 1, 2, 3, 6],
    "$[*].ceiling().abs()",
    [0, 1, -2, -3.4, 5.6],
    null,
  ],
  [
    `select jsonb_path_query('[0, 1, -2, -3.4, 5.6]', '$[*].ceiling().abs().type()');`,
    ["number", "number", "number", "number", "number"],
    "$[*].ceiling().abs().type()",
    [0, 1, -2, -3.4, 5.6],
    null,
  ],
  [
    `select jsonb_path_query('{}', '$.keyvalue()');`,
    [],
    "$.keyvalue()",
    {},
    null,
  ],
  [
    `select jsonb_path_query('{"a": 1, "b": [1, 2], "c": {"a": "bbb"}}', '$.keyvalue()');`,
    [
      // changed ids
      { id: 1, key: "a", value: 1 },
      { id: 1, key: "b", value: [1, 2] },
      { id: 1, key: "c", value: { a: "bbb" } },
    ],
    "$.keyvalue()",
    { a: 1, b: [1, 2], c: { a: "bbb" } },
    null,
  ],
  [
    `select jsonb_path_query('[{"a": 1, "b": [1, 2]}, {"c": {"a": "bbb"}}]', '$[*].keyvalue()');`,
    [
      // changed ids
      { id: 0, key: "a", value: 1 },
      { id: 0, key: "b", value: [1, 2] },
      { id: 2, key: "c", value: { a: "bbb" } },
    ],
    "$[*].keyvalue()",
    [{ a: 1, b: [1, 2] }, { c: { a: "bbb" } }],
    null,
  ],
  [
    `select jsonb_path_query('[{"a": 1, "b": [1, 2]}, {"c": {"a": "bbb"}}]', 'lax $.keyvalue()');`,
    [
      // changed ids
      { id: 0, key: "a", value: 1 },
      { id: 0, key: "b", value: [1, 2] },
      { id: 2, key: "c", value: { a: "bbb" } },
    ],
    "lax $.keyvalue()",
    [{ a: 1, b: [1, 2] }, { c: { a: "bbb" } }],
    null,
  ],
  [`select jsonb_path_query('[]', '$.double()');`, [], "$.double()", [], null],
  [
    `select jsonb_path_query('1.23', '$.double()');`,
    [1.23],
    "$.double()",
    1.23,
    null,
  ],
  [
    `select jsonb_path_query('"1.23"', '$.double()');`,
    [1.23],
    "$.double()",
    "1.23",
    null,
  ],
  [
    `select jsonb_path_query('["", "a", "abc", "abcabc"]', '$[*] ? (@ starts with "abc")');`,
    ["abc", "abcabc"],
    '$[*] ? (@ starts with "abc")',
    ["", "a", "abc", "abcabc"],
    null,
  ],
  [
    `select jsonb_path_query('["", "a", "abc", "abcabc"]', 'strict $ ? (@[*] starts with "abc")');`,
    [["", "a", "abc", "abcabc"]],
    'strict $ ? (@[*] starts with "abc")',
    ["", "a", "abc", "abcabc"],
    null,
  ],
  [
    `select jsonb_path_query('["", "a", "abd", "abdabc"]', 'strict $ ? (@[*] starts with "abc")');`,
    [],
    'strict $ ? (@[*] starts with "abc")',
    ["", "a", "abd", "abdabc"],
    null,
  ],
  [
    `select jsonb_path_query('["abc", "abcabc", null, 1]', 'strict $ ? (@[*] starts with "abc")');`,
    [],
    'strict $ ? (@[*] starts with "abc")',
    ["abc", "abcabc", null, 1],
    null,
  ],
  [
    `select jsonb_path_query('["abc", "abcabc", null, 1]', 'strict $ ? ((@[*] starts with "abc") is unknown)');`,
    [["abc", "abcabc", null, 1]],
    'strict $ ? ((@[*] starts with "abc") is unknown)',
    ["abc", "abcabc", null, 1],
    null,
  ],
  [
    `select jsonb_path_query('[[null, 1, "abc", "abcabc"]]', 'lax $ ? (@[*] starts with "abc")');`,
    [[null, 1, "abc", "abcabc"]],
    'lax $ ? (@[*] starts with "abc")',
    [[null, 1, "abc", "abcabc"]],
    null,
  ],
  [
    `select jsonb_path_query('[[null, 1, "abd", "abdabc"]]', 'lax $ ? ((@[*] starts with "abc") is unknown)');`,
    [[null, 1, "abd", "abdabc"]],
    'lax $ ? ((@[*] starts with "abc") is unknown)',
    [[null, 1, "abd", "abdabc"]],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "abd", "abdabc"]', 'lax $[*] ? ((@ starts with "abc") is unknown)');`,
    [null, 1],
    'lax $[*] ? ((@ starts with "abc") is unknown)',
    [null, 1, "abd", "abdabc"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\\nabc", "ab\\nadc"]', 'lax $[*] ? (@ like_regex "^ab.*c")');`,
    ["abc", "abdacb"],
    'lax $[*] ? (@ like_regex "^ab.*c")',
    [null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\nabc", "ab\nadc"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\\nabc", "ab\\nadc"]', 'lax $[*] ? (@ like_regex "^ab.*c" flag "i")');`,
    ["abc", "aBdC", "abdacb"],
    'lax $[*] ? (@ like_regex "^ab.*c" flag "i")',
    [null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\nabc", "ab\nadc"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\\nabc", "ab\\nadc"]', 'lax $[*] ? (@ like_regex "^ab.*c" flag "m")');`,
    ["abc", "abdacb", "adc\nabc"],
    'lax $[*] ? (@ like_regex "^ab.*c" flag "m")',
    [null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\nabc", "ab\nadc"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\\nabc", "ab\\nadc"]', 'lax $[*] ? (@ like_regex "^ab.*c" flag "s")');`,
    ["abc", "abdacb", "ab\nadc"],
    'lax $[*] ? (@ like_regex "^ab.*c" flag "s")',
    [null, 1, "abc", "abd", "aBdC", "abdacb", "babc", "adc\nabc", "ab\nadc"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "a\\b", "a\\\\b", "^a\\\\b$"]', 'lax $[*] ? (@ like_regex "a\\\\b" flag "q")');`,
    ["a\\b", "^a\\b$"],
    'lax $[*] ? (@ like_regex "a\\\\b" flag "q")',
    [null, 1, "a\b", "a\\b", "^a\\b$"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "a\\b", "a\\\\b", "^a\\\\b$"]', 'lax $[*] ? (@ like_regex "a\\\\b" flag "")');`,
    ["a\b"],
    'lax $[*] ? (@ like_regex "a\\\\b" flag "")',
    [null, 1, "a\b", "a\\b", "^a\\b$"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "a\\b", "a\\\\b", "^a\\\\b$"]', 'lax $[*] ? (@ like_regex "^a\\\\b$" flag "q")');`,
    ["^a\\b$"],
    'lax $[*] ? (@ like_regex "^a\\\\b$" flag "q")',
    [null, 1, "a\b", "a\\b", "^a\\b$"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "a\\b", "a\\\\b", "^a\\\\b$"]', 'lax $[*] ? (@ like_regex "^a\\\\B$" flag "q")');`,
    [],
    'lax $[*] ? (@ like_regex "^a\\\\B$" flag "q")',
    [null, 1, "a\b", "a\\b", "^a\\b$"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "a\\b", "a\\\\b", "^a\\\\b$"]', 'lax $[*] ? (@ like_regex "^a\\\\B$" flag "iq")');`,
    ["^a\\b$"],
    'lax $[*] ? (@ like_regex "^a\\\\B$" flag "iq")',
    [null, 1, "a\b", "a\\b", "^a\\b$"],
    null,
  ],
  [
    `select jsonb_path_query('[null, 1, "a\\b", "a\\\\b", "^a\\\\b$"]', 'lax $[*] ? (@ like_regex "^a\\\\b$" flag "")');`,
    ["a\b"],
    'lax $[*] ? (@ like_regex "^a\\\\b$" flag "")',
    [null, 1, "a\b", "a\\b", "^a\\b$"],
    null,
  ],
  [
    `select jsonb_path_query('[]', '$.datetime()');`,
    [],
    "$.datetime()",
    [],
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017"', '$.datetime("dd-mm-yyyy")');`,
    ["2017-03-10"],
    '$.datetime("dd-mm-yyyy")',
    "10-03-2017",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017"', '$.datetime("dd-mm-yyyy").type()');`,
    ["date"],
    '$.datetime("dd-mm-yyyy").type()',
    "10-03-2017",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017 12:34"', '       $.datetime("dd-mm-yyyy HH24:MI").type()');`,
    ["timestamp without time zone"],
    '       $.datetime("dd-mm-yyyy HH24:MI").type()',
    "10-03-2017 12:34",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017 12:34 +05:20"', '$.datetime("dd-mm-yyyy HH24:MI TZH:TZM").type()');`,
    ["timestamp with time zone"],
    '$.datetime("dd-mm-yyyy HH24:MI TZH:TZM").type()',
    "10-03-2017 12:34 +05:20",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56"', '$.datetime("HH24:MI:SS").type()');`,
    ["time without time zone"],
    '$.datetime("HH24:MI:SS").type()',
    "12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56 +05:20"', '$.datetime("HH24:MI:SS TZH:TZM").type()');`,
    ["time with time zone"],
    '$.datetime("HH24:MI:SS TZH:TZM").type()',
    "12:34:56 +05:20",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017T12:34:56"', '$.datetime("dd-mm-yyyy\\"T\\"HH24:MI:SS")');`,
    ["2017-03-10T12:34:56"],
    '$.datetime("dd-mm-yyyy\\"T\\"HH24:MI:SS")',
    "10-03-2017T12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10"', '$.datetime().type()');`,
    ["date"],
    "$.datetime().type()",
    "2017-03-10",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10"', '$.datetime()');`,
    ["2017-03-10"],
    "$.datetime()",
    "2017-03-10",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10 12:34:56"', '$.datetime().type()');`,
    ["timestamp without time zone"],
    "$.datetime().type()",
    "2017-03-10 12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10 12:34:56"', '$.datetime()');`,
    ["2017-03-10T12:34:56"],
    "$.datetime()",
    "2017-03-10 12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10 12:34:56+3"', '$.datetime().type()');`,
    ["timestamp with time zone"],
    "$.datetime().type()",
    "2017-03-10 12:34:56+3",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10 12:34:56+3"', '$.datetime()');`,
    ["2017-03-10T12:34:56+03:00"],
    "$.datetime()",
    "2017-03-10 12:34:56+3",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10 12:34:56+3:10"', '$.datetime().type()');`,
    ["timestamp with time zone"],
    "$.datetime().type()",
    "2017-03-10 12:34:56+3:10",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10 12:34:56+3:10"', '$.datetime()');`,
    ["2017-03-10T12:34:56+03:10"],
    "$.datetime()",
    "2017-03-10 12:34:56+3:10",
    null,
  ],
  [
    `select jsonb_path_query('"2017-03-10T12:34:56+3:10"', '$.datetime()');`,
    ["2017-03-10T12:34:56+03:10"],
    "$.datetime()",
    "2017-03-10T12:34:56+3:10",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56"', '$.datetime().type()');`,
    ["time without time zone"],
    "$.datetime().type()",
    "12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56"', '$.datetime()');`,
    ["12:34:56"],
    "$.datetime()",
    "12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56+3"', '$.datetime().type()');`,
    ["time with time zone"],
    "$.datetime().type()",
    "12:34:56+3",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56+3"', '$.datetime()');`,
    ["12:34:56+03:00"],
    "$.datetime()",
    "12:34:56+3",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56+3:10"', '$.datetime().type()');`,
    ["time with time zone"],
    "$.datetime().type()",
    "12:34:56+3:10",
    null,
  ],
  [
    `select jsonb_path_query('"12:34:56+3:10"', '$.datetime()');`,
    ["12:34:56+03:10"],
    "$.datetime()",
    "12:34:56+3:10",
    null,
  ],
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}]', '$[*]');`,
    [{ a: 1 }, { a: 2 }],
    "$[*]",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}]', '$[*] ? (@.a > 10)');`,
    [],
    "$[*] ? (@.a > 10)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  // jsonb_path_query_array
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}]', '$[*].a');`,
    [1, 2],
    "$[*].a",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}]', '$[*].a ? (@ == 1)');`,
    [1],
    "$[*].a ? (@ == 1)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}]', '$[*].a ? (@ > 10)');`,
    [],
    "$[*].a ? (@ > 10)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}, {"a": 3}, {"a": 5}]', '$[*].a ? (@ > $min && @ < $max)', vars => '{"min": 1, "max": 4}');`,
    [2, 3],
    "$[*].a ? (@ > $min && @ < $max)",
    [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 5 }],
    { min: 1, max: 4 },
  ],
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}, {"a": 3}, {"a": 5}]', '$[*].a ? (@ > $min && @ < $max)', vars => '{"min": 3, "max": 4}');`,
    [],
    "$[*].a ? (@ > $min && @ < $max)",
    [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 5 }],
    { min: 3, max: 4 },
  ],
];
describe("jsonb_path_query", () => {
  test.each(jsonb_path_query)("%s", (_sql, expected, path, root, vars) => {
    const ids: WeakMap<object, number> = new WeakMap();
    if (path.includes("keyvalue")) {
      root = JSON.parse(JSON.stringify(root), makeKeyValueIdReviver(ids));
    }
    const getId = ids.get.bind(ids);
    const actual = normalize(
      Array.from(query(root, path, vars, { getId, regExp: "posix" }))
    );
    expect(actual).toEqual(expected);
  });
});

/*
select
  x, y,
  jsonb_path_query(
    '[true, false, null]',
    '$[*] ? (@ == true  &&  ($x == true && $y == true) ||
        @ == false && !($x == true && $y == true) ||
        @ == null  &&  ($x == true && $y == true) is unknown)',
    jsonb_build_object('x', x, 'y', y)
  ) as "x && y"
from
  (values (jsonb 'true'), ('false'), ('"null"')) x(x),
  (values (jsonb 'true'), ('false'), ('"null"')) y(y);
*/
const ternaryAnd = [
  [true, true, true],
  [true, false, false],
  [true, "null", null],
  [false, true, false],
  [false, false, false],
  [false, "null", false],
  ["null", true, null],
  ["null", false, false],
  ["null", "null", null],
];
describe("ternary logic - and", () => {
  test.each(ternaryAnd)("x:%j y:%j x&&y:%j", (x, y, result) => {
    const path = `$[*] ? (
      @ == true  &&  ($x == true && $y == true) ||
      @ == false && !($x == true && $y == true) ||
      @ == null  &&  ($x == true && $y == true) is unknown
    )`;
    const actual = Array.from(query([true, false, null], path, { x, y }));
    expect(actual).toEqual([result]);
  });
});

/*
select
  x, y,
  jsonb_path_query(
    '[true, false, null]',
    '$[*] ? (@ == true  &&  ($x == true || $y == true) ||
        @ == false && !($x == true || $y == true) ||
        @ == null  &&  ($x == true || $y == true) is unknown)',
    jsonb_build_object('x', x, 'y', y)
  ) as "x || y"
from
  (values (jsonb 'true'), ('false'), ('"null"')) x(x),
  (values (jsonb 'true'), ('false'), ('"null"')) y(y);
*/
const ternaryOr = [
  [true, true, true],
  [true, false, true],
  [true, "null", true],
  [false, true, true],
  [false, false, false],
  [false, "null", null],
  ["null", true, true],
  ["null", false, null],
  ["null", "null", null],
];
describe("ternary logic - or", () => {
  test.each(ternaryOr)("x:%j y:%j x||y:%j", (x, y, result) => {
    const path = `$[*] ? (
      @ == true  &&  ($x == true || $y == true) ||
      @ == false && !($x == true || $y == true) ||
      @ == null  &&  ($x == true || $y == true) is unknown
    )`;
    const actual = Array.from(query([true, false, null], path, { x, y }));
    expect(actual).toEqual([result]);
  });
});

// (_sql, error, path, root, vars)
const error_jsonb_path_query: Array<[string, string, string, Json, Json]> = [
  [
    `select jsonb_path_query('[1]', 'strict $[1]');`,
    "jsonpath array subscript is out of bounds",
    "strict $[1]",
    [1],
    null,
  ],
  [
    `select jsonb_path_query('[1]', 'lax $[10000000000000000]');`,
    "jsonpath array subscript is out of integer range",
    "lax $[10000000000000000]",
    [1],
    null,
  ],
  [
    `select jsonb_path_query('[1]', 'strict $[10000000000000000]');`,
    "jsonpath array subscript is out of integer range",
    "strict $[10000000000000000]",
    [1],
    null,
  ],
  [
    `select jsonb_path_query('1', 'strict $.a');`,
    "jsonpath member accessor can only be applied to an object",
    "strict $.a",
    1,
    null,
  ],
  [
    `select jsonb_path_query('1', 'strict $.*');`,
    "jsonpath wildcard member accessor can only be applied to an object",
    "strict $.*",
    1,
    null,
  ],
  [
    `select jsonb_path_query('[]', 'strict $.a');`,
    "jsonpath member accessor can only be applied to an object",
    "strict $.a",
    [],
    null,
  ],
  [
    `select jsonb_path_query('{}', 'strict $.a');`,
    'JSON object does not contain key "a"',
    "strict $.a",
    {},
    null,
  ],
  [
    `select jsonb_path_query('1', 'strict $[1]');`,
    "jsonpath array accessor can only be applied to an array",
    "strict $[1]",
    1,
    null,
  ],
  [
    `select jsonb_path_query('1', 'strict $[*]');`,
    "jsonpath wildcard array accessor can only be applied to an array",
    "strict $[*]",
    1,
    null,
  ],
  [
    `select jsonb_path_query('[]', 'strict $[1]');`,
    "jsonpath array subscript is out of bounds",
    "strict $[1]",
    [],
    null,
  ],
  [
    `select jsonb_path_query('[]', 'strict $["a"]');`,
    "jsonpath array subscript is not a single numeric value",
    'strict $["a"]',
    [],
    null,
  ],
  [
    `select jsonb_path_query('[12, {"a": 13}, {"b": 14}]', 'lax $[0 to 10 / 0].a');`,
    "division by zero",
    "lax $[0 to 10 / 0].a",
    [12, { a: 13 }, { b: 14 }],
    null,
  ],
  [
    `select jsonb_path_query('[1,2,3]', 'strict $[*].a');`,
    "jsonpath member accessor can only be applied to an object",
    "strict $[*].a",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_query('[]', 'strict $[last]');`,
    "jsonpath array subscript is out of bounds",
    "strict $[last]",
    [],
    null,
  ],
  [
    `select jsonb_path_query('[1,2,3]', '$[last ? (@.type() == "string")]');`,
    "jsonpath array subscript is not a single numeric value",
    '$[last ? (@.type() == "string")]',
    [1, 2, 3],
    null,
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)');`,
    'could not find jsonpath variable "value"',
    "$ ? (@.a < $value)",
    { a: 10 },
    null,
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)', '1');`,
    '"vars" argument is not an object',
    "$ ? (@.a < $value)",
    { a: 10 },
    1,
  ],
  [
    `select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)', '[{"value" : 13}]');`,
    '"vars" argument is not an object',
    "$ ? (@.a < $value)",
    { a: 10 },
    [{ value: 13 }],
  ],
  [
    `select jsonb_path_query('0', '1 / $');`,
    "division by zero",
    "1 / $",
    0,
    null,
  ],
  [
    `select jsonb_path_query('0', '1 / $ + 2');`,
    "division by zero",
    "1 / $ + 2",
    0,
    null,
  ],
  [
    `select jsonb_path_query('0', '-(3 + 1 % $)');`,
    "division by zero",
    "-(3 + 1 % $)",
    0,
    null,
  ],
  [
    `select jsonb_path_query('1', '$ + "2"');`,
    "right operand of jsonpath operator + is not a single numeric value",
    '$ + "2"',
    1,
    null,
  ],
  [
    `select jsonb_path_query('[1, 2]', '3 * $');`,
    "right operand of jsonpath operator * is not a single numeric value",
    "3 * $",
    [1, 2],
    null,
  ],
  [
    `select jsonb_path_query('"a"', '-$');`,
    "operand of unary jsonpath operator - is not a numeric value",
    "-$",
    "a",
    null,
  ],
  [
    `select jsonb_path_query('[1,"2",3]', '+$');`,
    "operand of unary jsonpath operator + is not a numeric value",
    "+$",
    [1, "2", 3],
    null,
  ],
  [
    `select jsonb_path_query('{"a": [1, 2]}', 'lax $.a * 3');`,
    "left operand of jsonpath operator * is not a single numeric value",
    "lax $.a * 3",
    { a: [1, 2] },
    null,
  ],
  [
    `select jsonb_path_query('[1,null,true,"11",[],[1],[1,2,3],{},{"a":1,"b":2}]', 'strict $[*].size()');`,
    "jsonpath item method .size() can only be applied to an array",
    "strict $[*].size()",
    [1, null, true, "11", [], [1], [1, 2, 3], {}, { a: 1, b: 2 }],
    null,
  ],
  [
    `select jsonb_path_query('[{},1]', '$[*].keyvalue()');`,
    "jsonpath item method .keyvalue() can only be applied to an object",
    "$[*].keyvalue()",
    [{}, 1],
    null,
  ],
  [
    `select jsonb_path_query('[{"a": 1, "b": [1, 2]}, {"c": {"a": "bbb"}}]', 'strict $.keyvalue()');`,
    "jsonpath item method .keyvalue() can only be applied to an object",
    "strict $.keyvalue()",
    [{ a: 1, b: [1, 2] }, { c: { a: "bbb" } }],
    null,
  ],
  [
    `select jsonb_path_query('[{"a": 1, "b": [1, 2]}, {"c": {"a": "bbb"}}]', 'strict $.keyvalue().a');`,
    "jsonpath item method .keyvalue() can only be applied to an object",
    "strict $.keyvalue().a",
    [{ a: 1, b: [1, 2] }, { c: { a: "bbb" } }],
    null,
  ],
  [
    `select jsonb_path_query('null', '$.double()');`,
    "jsonpath item method .double() can only be applied to a string or numeric value",
    "$.double()",
    null,
    null,
  ],
  [
    `select jsonb_path_query('true', '$.double()');`,
    "jsonpath item method .double() can only be applied to a string or numeric value",
    "$.double()",
    true,
    null,
  ],
  [
    `select jsonb_path_query('[]', 'strict $.double()');`,
    "jsonpath item method .double() can only be applied to a string or numeric value",
    "strict $.double()",
    [],
    null,
  ],
  [
    `select jsonb_path_query('{}', '$.double()');`,
    "jsonpath item method .double() can only be applied to a string or numeric value",
    "$.double()",
    {},
    null,
  ],
  [
    `select jsonb_path_query('"1.23aaa"', '$.double()');`,
    "string argument of jsonpath item method .double() is not a valid representation of a double precision number",
    "$.double()",
    "1.23aaa",
    null,
  ],
  [
    `select jsonb_path_query('1e1000', '$.double()');`,
    "numeric argument of jsonpath item method .double() is out of range for type double precision",
    "$.double()",
    Infinity,
    null,
  ],
  [
    `select jsonb_path_query('"nan"', '$.double()');`,
    "string argument of jsonpath item method .double() is not a valid representation of a double precision number",
    "$.double()",
    "nan",
    null,
  ],
  [
    `select jsonb_path_query('"NaN"', '$.double()');`,
    "string argument of jsonpath item method .double() is not a valid representation of a double precision number",
    "$.double()",
    "NaN",
    null,
  ],
  [
    `select jsonb_path_query('"inf"', '$.double()');`,
    "string argument of jsonpath item method .double() is not a valid representation of a double precision number",
    "$.double()",
    "inf",
    null,
  ],
  [
    `select jsonb_path_query('"-inf"', '$.double()');`,
    "string argument of jsonpath item method .double() is not a valid representation of a double precision number",
    "$.double()",
    "-inf",
    null,
  ],
  [
    `select jsonb_path_query('{}', '$.abs()');`,
    "jsonpath item method .abs() can only be applied to a numeric value",
    "$.abs()",
    {},
    null,
  ],
  [
    `select jsonb_path_query('true', '$.floor()');`,
    "jsonpath item method .floor() can only be applied to a numeric value",
    "$.floor()",
    true,
    null,
  ],
  [
    `select jsonb_path_query('"1.2"', '$.ceiling()');`,
    "jsonpath item method .ceiling() can only be applied to a numeric value",
    "$.ceiling()",
    "1.2",
    null,
  ],
  [
    `select jsonb_path_query('null', '$.datetime()');`,
    "jsonpath item method .datetime() can only be applied to a string",
    "$.datetime()",
    null,
    null,
  ],
  [
    `select jsonb_path_query('true', '$.datetime()');`,
    "jsonpath item method .datetime() can only be applied to a string",
    "$.datetime()",
    true,
    null,
  ],
  [
    `select jsonb_path_query('1', '$.datetime()');`,
    "jsonpath item method .datetime() can only be applied to a string",
    "$.datetime()",
    1,
    null,
  ],
  [
    `select jsonb_path_query('[]', 'strict $.datetime()');`,
    "jsonpath item method .datetime() can only be applied to a string",
    "strict $.datetime()",
    [],
    null,
  ],
  [
    `select jsonb_path_query('{}', '$.datetime()');`,
    "jsonpath item method .datetime() can only be applied to a string",
    "$.datetime()",
    {},
    null,
  ],
  [
    `select jsonb_path_query('"bogus"', '$.datetime()');`,
    'datetime format is not recognized: "bogus"',
    "$.datetime()",
    "bogus",
    null,
  ],
  /*[
    `select jsonb_path_query('"12:34"', '$.datetime("aaa")');`,
    'invalid datetime format separator: "a"',
    '$.datetime("aaa")',
    "12:34",
    null,
  ],
  [
    `select jsonb_path_query('"aaaa"', '$.datetime("HH24")');`,
    'invalid value "aa" for "HH24"',
    '$.datetime("HH24")',
    "aaaa",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017 12:34"', '$.datetime("dd-mm-yyyy")');`,
    "trailing characters remain in input string after datetime format",
    '$.datetime("dd-mm-yyyy")',
    "10-03-2017 12:34",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017 12:34"', '$.datetime("dd-mm-yyyy").type()');`,
    "trailing characters remain in input string after datetime format",
    '$.datetime("dd-mm-yyyy").type()',
    "10-03-2017 12:34",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017t12:34:56"', '$.datetime("dd-mm-yyyy\\"T\\"HH24:MI:SS")');`,
    'unmatched format character "T"',
    '$.datetime("dd-mm-yyyy\\"T\\"HH24:MI:SS")',
    "10-03-2017t12:34:56",
    null,
  ],
  [
    `select jsonb_path_query('"10-03-2017 12:34:56"', '$.datetime("dd-mm-yyyy\\"T\\"HH24:MI:SS")');`,
    'unmatched format character "T"',
    '$.datetime("dd-mm-yyyy\\"T\\"HH24:MI:SS")',
    "10-03-2017 12:34:56",
    null,
  ],*/
  [
    `select jsonb_path_query('"2017-03-10t12:34:56+3:10"', '$.datetime()');`,
    'datetime format is not recognized: "2017-03-10t12:34:56+3:10"',
    "$.datetime()",
    "2017-03-10t12:34:56+3:10",
    null,
  ],
  // error_jsonb_path_query_array
  [
    `SELECT jsonb_path_query('[{"a": 1}, {"a": 2}, {}]', 'strict $[*].a');`,
    'JSON object does not contain key "a"',
    "strict $[*].a",
    [{ a: 1 }, { a: 2 }, {}],
    null,
  ],
];
describe("error_jsonb_path_query", () => {
  test.each(error_jsonb_path_query)("%s", (_sql, error, path, root, vars) => {
    expect(() =>
      Array.from(query(root, path, vars as { [key: string]: Json } | null))
    ).toThrow(error);
  });
});
const error_jsonb_path_query_silent: { [key: string]: Json } = {
  [`select jsonb_path_query('[1,"2",3]', '+$');`]: [1],
  [`SELECT jsonb_path_query('[{"a": 1}, {"a": 2}, {}]', 'strict $[*].a');`]: [
    1, 2,
  ],
  [`select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)');`]: null,
  [`select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)', '1');`]:
    null,
  [`select * from jsonb_path_query('{"a": 10}', '$ ? (@.a < $value)', '[{"value" : 13}]');`]:
    null,
  [`select jsonb_path_query('"12:34"', '$.datetime("aaa")');`]: null,
};
describe("error_jsonb_path_query silent", () => {
  test.each(error_jsonb_path_query)("%s", (sql, error, path, root, vars) => {
    const expected = error_jsonb_path_query_silent[sql] ?? [];
    if (expected === null) {
      expect(() =>
        Array.from(
          query(root, path, vars as { [key: string]: Json } | null, {
            silent: true,
          })
        )
      ).toThrow(error);
    } else {
      const actual = Array.from(
        query(root, path, vars as { [key: string]: Json } | null, {
          silent: true,
        })
      );
      expect(actual).toEqual(expected);
    }
  });
});

const jsonb_path_query_first: Array<
  [string, Json | undefined, string, Json, { [key: string]: Json } | null]
> = [
  [
    `SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}]', '$[*].a');`,
    1,
    "$[*].a",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}]', '$[*].a ? (@ == 1)');`,
    1,
    "$[*].a ? (@ == 1)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}]', '$[*].a ? (@ > 10)');`,
    undefined,
    "$[*].a ? (@ > 10)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}, {"a": 3}, {"a": 5}]', '$[*].a ? (@ > $min && @ < $max)', vars => '{"min": 1, "max": 4}');`,
    2,
    "$[*].a ? (@ > $min && @ < $max)",
    [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 5 }],
    { min: 1, max: 4 },
  ],
  [
    `SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}, {"a": 3}, {"a": 5}]', '$[*].a ? (@ > $min && @ < $max)', vars => '{"min": 3, "max": 4}');`,
    undefined,
    "$[*].a ? (@ > $min && @ < $max)",
    [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 5 }],
    { min: 3, max: 4 },
  ],
];
describe("jsonb_path_query_first", () => {
  test.each(jsonb_path_query_first)(
    "%s",
    (_sql, expected, path, root, vars) => {
      const actual = query_first(root, path, vars);
      expect(actual).toEqual(expected);
    }
  );
});

const error_jsonb_path_query_first: Array<
  [string, string, string, Json, { [key: string]: Json } | null]
> = [
  [
    `SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}, {}]', 'strict $[*].a');`,
    'JSON object does not contain key "a"',
    "strict $[*].a",
    [{ a: 1 }, { a: 2 }, {}],
    null,
  ],
];
describe("error_jsonb_path_query_first", () => {
  test.each(error_jsonb_path_query_first)(
    "%s",
    (_sql, error, path, root, vars) => {
      expect(() => query_first(root, path, vars)).toThrow(error);
    }
  );
});
const error_jsonb_path_query_first_silent: { [key: string]: Json } = {
  [`SELECT jsonb_path_query_first('[{"a": 1}, {"a": 2}, {}]', 'strict $[*].a');`]: 1,
};
describe("error_path_query_first silent", () => {
  test.each(error_jsonb_path_query_first)(
    "%s",
    (sql, error, path, root, vars) => {
      const expected = error_jsonb_path_query_first_silent[sql] ?? undefined;
      if (expected === null) {
        expect(() => query_first(root, path, vars, { silent: true })).toThrow(
          error
        );
      } else {
        const actual = query_first(root, path, vars, { silent: true });
        expect(actual).toEqual(expected);
      }
    }
  );
});

const jsonb_path_exists: Array<
  [string, boolean, string, Json, { [key: string]: Json } | null]
> = [
  // jsonb_path_exists
  [
    `SELECT jsonb_path_exists('[{"a": 1}, {"a": 2}]', '$[*].a ? (@ > 1)');`,
    true,
    "$[*].a ? (@ > 1)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_exists('[{"a": 1}, {"a": 2}, {"a": 3}, {"a": 5}]', '$[*] ? (@.a > $min && @.a < $max)', vars => '{"min": 1, "max": 4}');`,
    true,
    "$[*] ? (@.a > $min && @.a < $max)",
    [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 5 }],
    { max: 4, min: 1 },
  ],
  [
    `SELECT jsonb_path_exists('[{"a": 1}, {"a": 2}, {"a": 3}, {"a": 5}]', '$[*] ? (@.a > $min && @.a < $max)', vars => '{"min": 3, "max": 4}');`,
    false,
    "$[*] ? (@.a > $min && @.a < $max)",
    [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 5 }],
    { max: 4, min: 3 },
  ],
  // jsonb_path_exists_silent
  [`select jsonb_path_exists('{"a": 12}', '$');`, true, "$", { a: 12 }, null],
  [`select jsonb_path_exists('{"a": 12}', '1');`, true, "1", { a: 12 }, null],
  [
    `select jsonb_path_exists('{"a": 12}', '$.a.b');`,
    false,
    "$.a.b",
    { a: 12 },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": 12}', '$.b');`,
    false,
    "$.b",
    { a: 12 },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": 12}', '$.a + 2');`,
    true,
    "$.a + 2",
    { a: 12 },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"a": 12}}', '$.a.a');`,
    true,
    "$.a.a",
    { a: { a: 12 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"a": 12}}', '$.*.a');`,
    true,
    "$.*.a",
    { a: { a: 12 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"b": {"a": 12}}', '$.*.a');`,
    true,
    "$.*.a",
    { b: { a: 12 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"b": {"a": 12}}', '$.*.b');`,
    false,
    "$.*.b",
    { b: { a: 12 } },
    null,
  ],
  [`select jsonb_path_exists('{}', '$.*');`, false, "$.*", {}, null],
  [`select jsonb_path_exists('{"a": 1}', '$.*');`, true, "$.*", { a: 1 }, null],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', 'lax $.**{1}');`,
    true,
    "lax $.**{1}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', 'lax $.**{2}');`,
    true,
    "lax $.**{2}",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', 'lax $.**{3}');`,
    false,
    "lax $.**{3}",
    { a: { b: 1 } },
    null,
  ],
  [`select jsonb_path_exists('[]', '$[*]');`, false, "$[*]", [], null],
  [`select jsonb_path_exists('[1]', '$[*]');`, true, "$[*]", [1], null],
  [`select jsonb_path_exists('[1]', '$[1]');`, false, "$[1]", [1], null],
  [`select jsonb_path_exists('[1]', '$[0]');`, true, "$[0]", [1], null],
  [`select jsonb_path_exists('[1]', '$[0.3]');`, true, "$[0.3]", [1], null],
  [`select jsonb_path_exists('[1]', '$[0.5]');`, true, "$[0.5]", [1], null],
  [`select jsonb_path_exists('[1]', '$[0.9]');`, true, "$[0.9]", [1], null],
  [`select jsonb_path_exists('[1]', '$[1.2]');`, false, "$[1.2]", [1], null],
  [
    `select jsonb_path_exists('{"a": [1,2,3], "b": [3,4,5]}', '$ ? (@.a[*] >  @.b[*])');`,
    false,
    "$ ? (@.a[*] >  @.b[*])",
    { a: [1, 2, 3], b: [3, 4, 5] },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": [1,2,3], "b": [3,4,5]}', '$ ? (@.a[*] >= @.b[*])');`,
    true,
    "$ ? (@.a[*] >= @.b[*])",
    { a: [1, 2, 3], b: [3, 4, 5] },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": [1,2,3], "b": [3,4,"5"]}', '$ ? (@.a[*] >= @.b[*])');`,
    true,
    "$ ? (@.a[*] >= @.b[*])",
    { a: [1, 2, 3], b: [3, 4, "5"] },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": [1,2,3], "b": [3,4,"5"]}', 'strict $ ? (@.a[*] >= @.b[*])');`,
    false,
    "strict $ ? (@.a[*] >= @.b[*])",
    { a: [1, 2, 3], b: [3, 4, "5"] },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": [1,2,3], "b": [3,4,null]}', '$ ? (@.a[*] >= @.b[*])');`,
    true,
    "$ ? (@.a[*] >= @.b[*])",
    { a: [1, 2, 3], b: [3, 4, null] },
    null,
  ],
  [
    `select jsonb_path_exists('1', '$ ? ((@ == "1") is unknown)');`,
    true,
    '$ ? ((@ == "1") is unknown)',
    1,
    null,
  ],
  [
    `select jsonb_path_exists('1', '$ ? ((@ == 1) is unknown)');`,
    false,
    "$ ? ((@ == 1) is unknown)",
    1,
    null,
  ],
  [
    `select jsonb_path_exists('[{"a": 1}, {"a": 2}]', '$[0 to 1] ? (@.a > 1)');`,
    true,
    "$[0 to 1] ? (@.a > 1)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `select jsonb_path_exists('[{"a": 1}, {"a": 2}, 3]', 'lax $[*].a');`,
    true,
    "lax $[*].a",
    [{ a: 1 }, { a: 2 }, 3],
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', '$.**.b ? ( @ > 0)');`,
    true,
    "$.**.b ? ( @ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', '$.**{0}.b ? ( @ > 0)');`,
    false,
    "$.**{0}.b ? ( @ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', '$.**{1}.b ? ( @ > 0)');`,
    true,
    "$.**{1}.b ? ( @ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', '$.**{0 to last}.b ? ( @ > 0)');`,
    true,
    "$.**{0 to last}.b ? ( @ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', '$.**{1 to last}.b ? ( @ > 0)');`,
    true,
    "$.**{1 to last}.b ? ( @ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"b": 1}}', '$.**{1 to 2}.b ? ( @ > 0)');`,
    true,
    "$.**{1 to 2}.b ? ( @ > 0)",
    { a: { b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**.b ? ( @ > 0)');`,
    true,
    "$.**.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**{0}.b ? ( @ > 0)');`,
    false,
    "$.**{0}.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**{1}.b ? ( @ > 0)');`,
    false,
    "$.**{1}.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**{0 to last}.b ? ( @ > 0)');`,
    true,
    "$.**{0 to last}.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**{1 to last}.b ? ( @ > 0)');`,
    true,
    "$.**{1 to last}.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**{1 to 2}.b ? ( @ > 0)');`,
    true,
    "$.**{1 to 2}.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": {"c": {"b": 1}}}', '$.**{2 to 3}.b ? ( @ > 0)');`,
    true,
    "$.**{2 to 3}.b ? ( @ > 0)",
    { a: { c: { b: 1 } } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": 1, "b":1}', '$ ? (@.a == @.b)');`,
    true,
    "$ ? (@.a == @.b)",
    { a: 1, b: 1 },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 1, "b":1}}', '$ ? (@.a == @.b)');`,
    false,
    "$ ? (@.a == @.b)",
    { c: { a: 1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 1, "b":1}}', '$.c ? (@.a == @.b)');`,
    true,
    "$.c ? (@.a == @.b)",
    { c: { a: 1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 1, "b":1}}', '$.c ? ($.c.a == @.b)');`,
    true,
    "$.c ? ($.c.a == @.b)",
    { c: { a: 1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 1, "b":1}}', '$.* ? (@.a == @.b)');`,
    true,
    "$.* ? (@.a == @.b)",
    { c: { a: 1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": 1, "b":1}', '$.** ? (@.a == @.b)');`,
    true,
    "$.** ? (@.a == @.b)",
    { a: 1, b: 1 },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 1, "b":1}}', '$.** ? (@.a == @.b)');`,
    true,
    "$.** ? (@.a == @.b)",
    { c: { a: 1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": -1, "b":1}}', '$.** ? (@.a == - 1)');`,
    true,
    "$.** ? (@.a == - 1)",
    { c: { a: -1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": -1, "b":1}}', '$.** ? (@.a == -1)');`,
    true,
    "$.** ? (@.a == -1)",
    { c: { a: -1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": -1, "b":1}}', '$.** ? (@.a == -@.b)');`,
    true,
    "$.** ? (@.a == -@.b)",
    { c: { a: -1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": -1, "b":1}}', '$.** ? (@.a == - @.b)');`,
    true,
    "$.** ? (@.a == - @.b)",
    { c: { a: -1, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 0, "b":1}}', '$.** ? (@.a == 1 - @.b)');`,
    true,
    "$.** ? (@.a == 1 - @.b)",
    { c: { a: 0, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 2, "b":1}}', '$.** ? (@.a == 1 - - @.b)');`,
    true,
    "$.** ? (@.a == 1 - - @.b)",
    { c: { a: 2, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('{"c": {"a": 0, "b":1}}', '$.** ? (@.a == 1 - +@.b)');`,
    true,
    "$.** ? (@.a == 1 - +@.b)",
    { c: { a: 0, b: 1 } },
    null,
  ],
  [
    `select jsonb_path_exists('[1,2,3]', '$ ? (+@[*] > +2)');`,
    true,
    "$ ? (+@[*] > +2)",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_exists('[1,2,3]', '$ ? (+@[*] > +3)');`,
    false,
    "$ ? (+@[*] > +3)",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_exists('[1,2,3]', '$ ? (-@[*] < -2)');`,
    true,
    "$ ? (-@[*] < -2)",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_exists('[1,2,3]', '$ ? (-@[*] < -3)');`,
    false,
    "$ ? (-@[*] < -3)",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_exists('1', '$ ? ($ > 0)');`,
    true,
    "$ ? ($ > 0)",
    1,
    null,
  ],
  // These two are weird since the select `jsonb_path_query('["1",2,0,3]', '-$[*]');` errors but these don't.
  /*
  [
    `select jsonb_path_exists('["1",2,0,3]', '-$[*]');`,
    true,
    "-$[*]",
    ["1", 2, 0, 3],
    null,
  ],
  [
    `select jsonb_path_exists('[1,"2",0,3]', '-$[*]');`,
    true,
    "-$[*]",
    [1, "2", 0, 3],
    null,
  ],*/
  [`select jsonb_path_exists('2', '$ == "2"');`, true, '$ == "2"', 2, null],
  [
    `select jsonb_path_exists('{"a": 1, "b": [1, 2]}', 'lax $.keyvalue()');`,
    true,
    "lax $.keyvalue()",
    { a: 1, b: [1, 2] },
    null,
  ],
  [
    `select jsonb_path_exists('{"a": 1, "b": [1, 2]}', 'lax $.keyvalue().key');`,
    true,
    "lax $.keyvalue().key",
    { a: 1, b: [1, 2] },
    null,
  ],
  [
    `select jsonb_path_exists('"10-03-2017"', '$.datetime("dd-mm-yyyy")');`,
    true,
    '$.datetime("dd-mm-yyyy")',
    "10-03-2017",
    null,
  ],
  [
    `SELECT jsonb_path_exists('[{"a": 1}, {"a": 2}]', '$[*].a ? (@ > 1)');`,
    true,
    "$[*].a ? (@ > 1)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
  [
    `SELECT jsonb_path_exists('[{"a": 1}, {"a": 2}]', '$[*] ? (@.a > 2)');`,
    false,
    "$[*] ? (@.a > 2)",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
];
describe("jsonb_path_exists", () => {
  test.each(jsonb_path_exists)("%s", (_sql, expected, path, root, vars) => {
    const actual = exists(root, path, vars);
    expect(actual).toEqual(expected);
  });
});

/*
test.only("testme", () => {
  // [`select jsonb '[1,"2",0,3]' @? '-$[*]';`, true, "-$[*]", [1, "2", 0, 3]],
  const [_sql, expected, path, root] = [`select jsonb '["1",2,0,3]' @? '-$[*]';`, true, "-$[*]", ["1", 2, 0, 3]];
  const parsed = parse(path);
  debugger;
  const actual = exists(parsed, root);
  expect(actual).toEqual(expected);
});
*/
const error_jsonb_path_exists: Array<
  [string, string, string, Json, { [key: string]: Json } | null]
> = [
  [
    `select jsonb_path_exists('{"a": 12}', '$.b + 2');`,
    "left operand of jsonpath operator + is not a single numeric value",
    "$.b + 2",
    { a: 12 },
    null,
  ],
  [
    `select jsonb_path_exists('{"b": {"a": 12}}', 'strict $.*.b');`,
    'JSON object does not contain key "b"',
    "strict $.*.b",
    { b: { a: 12 } },
    null,
  ],
  [
    `select jsonb_path_exists('[1]', 'strict $[1]');`,
    "jsonpath array subscript is out of bounds",
    "strict $[1]",
    [1],
    null,
  ],
  [
    `select jsonb_path_exists('[1]', 'lax $[10000000000000000]');`,
    "jsonpath array subscript is out of integer range",
    "lax $[10000000000000000]",
    [1],
    null,
  ],
  [
    `select jsonb_path_exists('[1]', 'strict $[10000000000000000]');`,
    "jsonpath array subscript is out of integer range",
    "strict $[10000000000000000]",
    [1],
    null,
  ],
  [
    `select jsonb_path_exists('[1]', 'strict $[1.2]');`,
    "jsonpath array subscript is out of bounds",
    "strict $[1.2]",
    [1],
    null,
  ],
  [
    `select jsonb_path_exists('["1",2,0,3]', 'strict -$[*]');`,
    "operand of unary jsonpath operator - is not a numeric value",
    "strict -$[*]",
    ["1", 2, 0, 3],
    null,
  ],
  [
    `select jsonb_path_exists('[1,"2",0,3]', 'strict -$[*]');`,
    "operand of unary jsonpath operator - is not a numeric value",
    "strict -$[*]",
    [1, "2", 0, 3],
    null,
  ],
  [
    `select jsonb_path_exists('[{"a": 1}, {"a": 2}, 3]', 'strict $[*].a');`,
    "jsonpath member accessor can only be applied to an object",
    "strict $[*].a",
    [{ a: 1 }, { a: 2 }, 3],
    null,
  ],
];
describe("error_jsonb_path_exists", () => {
  test.each(error_jsonb_path_exists)("%s", (_sql, error, path, root, vars) => {
    expect(() => exists(root, path, vars)).toThrow(error);
  });
});
const error_jsonb_path_exists2: Array<[string, string, string, Json, Json]> =
  error_jsonb_path_query.map(([sql, ...x]) => [
    sql.replace("jsonb_path_query", "jsonb_path_exists"),
    ...x,
  ]);
describe("error_jsonb_path_exists2", () => {
  test.each(error_jsonb_path_exists2)("%s", (_sql, error, path, root, vars) => {
    expect(() =>
      exists(root, path, vars as { [key: string]: Json } | null)
    ).toThrow(error);
  });
});
describe("error_jsonb_path_exists silent", () => {
  test.each(error_jsonb_path_exists)("%s", (_sql, _error, path, root, vars) => {
    const actual = exists(root, path, vars, { silent: true });
    expect(actual).toEqual(undefined);
  });
});

const jsonb_path_match: Array<
  [string, boolean | undefined, string, Json, { [key: string]: Json } | null]
> = [
  [
    `select jsonb_path_match('[[1, true], [2, false]]', 'strict $[*] ? (@[0] > $x) [1]', '{"x": 1}');`,
    false,
    "strict $[*] ? (@[0] > $x) [1]",
    [
      [1, true],
      [2, false],
    ],
    { x: 1 },
  ],
  [
    `select jsonb_path_match('[[1, true], [2, false]]', 'strict $[*] ? (@[0] < $x) [1]', '{"x": 2}');`,
    true,
    "strict $[*] ? (@[0] < $x) [1]",
    [
      [1, true],
      [2, false],
    ],
    { x: 2 },
  ],
  [
    `select jsonb_path_match('[{"a": 1}, {"a": 2}, 3]', 'lax exists($[*].a)');`,
    true,
    "lax exists($[*].a)",
    [{ a: 1 }, { a: 2 }, 3],
    null,
  ],
  [
    `select jsonb_path_match('[{"a": 1}, {"a": 2}, 3]', 'strict exists($[*].a)');`,
    undefined,
    "strict exists($[*].a)",
    [{ a: 1 }, { a: 2 }, 3],
    null,
  ],
  [`SELECT jsonb_path_match('true', '$');`, true, "$", true, null],
  [`SELECT jsonb_path_match('false', '$');`, false, "$", false, null],
  [`SELECT jsonb_path_match('null', '$');`, undefined, "$", null, null],
  [
    `SELECT jsonb_path_match('[{"a": 1}, {"a": 2}]', '$[*].a > 1');`,
    true,
    "$[*].a > 1",
    [{ a: 1 }, { a: 2 }],
    null,
  ],
];
describe("jsonb_path_match", () => {
  test.each(jsonb_path_match)("%s", (_sql, expected, path, root, vars) => {
    const actual = match(root, path, vars);
    expect(actual).toEqual(expected);
  });
});

const error_jsonb_path_match: Array<
  [string, string, string, Json, { [key: string]: Json } | null]
> = [
  [
    `SELECT jsonb_path_match('1', '$');`,
    "single boolean result is expected",
    "$",
    1,
    null,
  ],
  [
    `SELECT jsonb_path_match('"a"', '$');`,
    "single boolean result is expected",
    "$",
    "a",
    null,
  ],
  [
    `SELECT jsonb_path_match('{}', '$');`,
    "single boolean result is expected",
    "$",
    {},
    null,
  ],
  [
    `SELECT jsonb_path_match('[true]', '$');`,
    "single boolean result is expected",
    "$",
    [true],
    null,
  ],
  [
    `SELECT jsonb_path_match('{}', 'lax $.a');`,
    "single boolean result is expected",
    "lax $.a",
    {},
    null,
  ],
  [
    `SELECT jsonb_path_match('{}', 'strict $.a');`,
    'JSON object does not contain key "a"',
    "strict $.a",
    {},
    null,
  ],
  [
    `SELECT jsonb_path_match('[true, true]', '$[*]');`,
    "single boolean result is expected",
    "$[*]",
    [true, true],
    null,
  ],
  // From jsonb_path_match_silent
  [
    `select jsonb_path_match('2', '1';)`,
    "single boolean result is expected",
    "1",
    2,
    null,
  ],
  [
    `select jsonb_path_match('{}', '$';)`,
    "single boolean result is expected",
    "$",
    {},
    null,
  ],
  [
    `select jsonb_path_match('[]', '$';)`,
    "single boolean result is expected",
    "$",
    [],
    null,
  ],
  [
    `select jsonb_path_match('[1,2,3]', '$[*]');`,
    "single boolean result is expected",
    "$[*]",
    [1, 2, 3],
    null,
  ],
  [
    `select jsonb_path_match('[]', '$[*]');`,
    "single boolean result is expected",
    "$[*]",
    [],
    null,
  ],
];
describe("error_jsonb_path_match", () => {
  test.each(error_jsonb_path_match)("%s", (_sql, error, path, root, vars) => {
    expect(() => match(root, path, vars)).toThrow(error);
  });
});
const error_jsonb_path_match2: Array<[string, string, string, Json, Json]> =
  error_jsonb_path_query.map(([sql, ...x]) => [
    sql.replace("jsonb_path_query", "jsonb_path_match"),
    ...x,
  ]);
describe("error_jsonb_path_match2", () => {
  test.each(error_jsonb_path_match2)("%s", (_sql, error, path, root, vars) => {
    expect(() =>
      match(root, path, vars as { [key: string]: Json } | null)
    ).toThrow(error);
  });
});
describe("error_jsonb_path_match silent", () => {
  test.each(error_jsonb_path_match)("%s", (_sql, _error, path, root, vars) => {
    const actual = match(root, path, vars, { silent: true });
    expect(actual).toEqual(undefined);
  });
});
