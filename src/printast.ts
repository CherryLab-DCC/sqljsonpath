console.log("doooxx");
import parse from "./parser.js";
for (const arg of process.argv.slice(1)) {
  console.log(JSON.stringify(parse(arg)));
}
