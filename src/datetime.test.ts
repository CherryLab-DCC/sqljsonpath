import {
  DateTimeTemplate,
  datetimeFromCaptureJsonPath,
  lexer,
} from "./datetime.js";

const examples = [
  ["yyyy-mm-dd", "2011-12-13", "2011-12-13"],
  ["HH24:MI:SSTZH:TZM", "14:15:16+08:00", "14:15:16+08:00"],
  ["HH24:MI:SSTZH", "14:15:16+08", "14:15:16+08:00"],
  ["HH24:MI:SS", "14:15:16", "14:15:16"],
  [
    "yyyy-mm-dd HH24:MI:SSTZH:TZM",
    "2011-12-13 14:15:16+08:00",
    "2011-12-13T14:15:16+08:00",
  ],
  [
    "yyyy-mm-dd HH24:MI:SSTZH",
    "2011-12-13 14:15:16+08",
    "2011-12-13T14:15:16+08:00",
  ],
  ["yyyy-mm-dd HH24:MI:SS", "2011-12-13 14:15:16", "2011-12-13T14:15:16"],
  [
    'yyyy-mm-dd"T"HH24:MI:SSTZH:TZM',
    "2011-12-13T14:15:16+08:00",
    "2011-12-13T14:15:16+08:00",
  ],
  [
    'yyyy-mm-dd"T"HH24:MI:SSTZH',
    "2011-12-13T14:15:16+08",
    "2011-12-13T14:15:16+08:00",
  ],
  ['yyyy-mm-dd"T"HH24:MI:SS', "2011-12-13T14:15:16", "2011-12-13T14:15:16"],
];

// test.each(jsonb_path_query)("%s", (_sql, expected, path, root, vars) => {
test.each(examples)("%s", (template, value, expected) => {
  const tokens = Array.from(lexer.reset(template));
  expect(tokens).toMatchSnapshot();
  const compiled = DateTimeTemplate.compile(template);
  expect(compiled).toBeInstanceOf(DateTimeTemplate);
  expect(compiled?.re.source).toMatchSnapshot();
  expect(compiled?.captureFuncs.map((f) => f.toString())).toMatchSnapshot();
  const captured = compiled?.exec(value);
  expect(captured).toBeDefined();
  expect(captured).toMatchSnapshot();
  const dt = datetimeFromCaptureJsonPath(captured);
  expect(dt).toBeDefined();
  const actual = dt?.toJSON();
  expect(actual).toEqual(expected);
});
