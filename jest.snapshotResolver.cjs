module.exports = {
  resolveSnapshotPath(testPath, snapshotExtension) {
    if (!testPath.startsWith(__dirname + "/")) {
      throw new Error(
        `expected testpath ${testpath} to be inside ${__dirname}`
      );
    }
    testPath = testPath.slice(__dirname.length + 1);
    return (
      __dirname +
      "/" +
      testPath.replace(/^lib\//, "src/").replace(/\.js$/, ".ts") +
      snapshotExtension
    );
  },
  resolveTestPath(snapshotFilePath, snapshotExtension) {
    if (!snapshotFilePath.startsWith(__dirname + "/")) {
      throw new Error(
        `expected testpath ${testpath} to be inside ${__dirname}`
      );
    }
    snapshotFilePath = snapshotFilePath.slice(__dirname.length + 1);
    return (
      __dirname +
      "/" +
      snapshotFilePath
        .slice(0, -snapshotExtension.length)
        .replace(/^src\//, "lib/")
        .replace(/\.ts$/, ".js")
    );
  },
  testPathForConsistencyCheck: __dirname + "/lib/example.test.js",
};
