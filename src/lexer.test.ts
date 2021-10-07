import lexer from "./lexer.js";
import { testpaths } from "./testdata.js";

describe("lexer", () => {
  test.each(testpaths)("%s", (testpath) => {
    lexer.reset(testpath);
    const actual = Array.from(lexer).map((x) => x.value);
    expect(actual).toMatchSnapshot();
  });
});
