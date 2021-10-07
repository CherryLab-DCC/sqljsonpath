import translatePosixRegExp, { lexer } from "./translatePosixRegExp";

const patterns = ["^ab.*c", "a\\b", "^a\\b$", "^a\\B$"];

test.each(patterns)("%s", (pattern) => {
  const translated = translatePosixRegExp(pattern);
  expect(translated).toMatchSnapshot();
});

describe("lexer", () => {
  test.each(patterns)("%s", (pattern) => {
    const actual = Array.from(lexer.reset(pattern));
    expect(actual).toMatchSnapshot();
  });
});
