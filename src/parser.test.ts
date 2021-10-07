import parse from "./parser.js";
import { testpaths } from "./testdata.js";

const disallowed = [
  "$.foo\x31 \x31",
  // Handle these in compile
  //"last",
  //"@",
  //"$ ? (last > 0)",
  //'$ ? (@ like_regex "(invalid pattern")',
  //'$ ? (@ like_regex "pattern" flag "xsms")',
  //"@ + 1",
  "",
  '$ ? (@ like_regex "pattern" flag "a")',
  "$ ? (@.a < .1)",
  "$ ? (@.a < -.1)",
  "$ ? (@.a < +.1)",
  "$ ? (@.a < .1e1)",
  "$ ? (@.a < -.1e1)",
  "$ ? (@.a < +.1e1)",
  "$ ? (@.a < .1e-1)",
  "$ ? (@.a < -.1e-1)",
  "$ ? (@.a < +.1e-1)",
  "$ ? (@.a < .1e+1)",
  "$ ? (@.a < -.1e+1)",
  "$ ? (@.a < +.1e+1)",
  "00",
  "1e",
  "1.2e",
  "1..e",
  "1..e3",
  "(1.).e",
  "(1.).e3",
];

describe("parse", () => {
  test.each(testpaths)("%s", (testpath) => {
    const actual = parse(testpath);
    expect(actual).toMatchSnapshot();
  });
});

describe("disallowed", () => {
  test.each(disallowed)("%s", (testpath) => {
    expect(() => parse(testpath)).toThrow();
  });
});
