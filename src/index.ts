import parse from "./parser.js";
import { Query, QueryError } from "./query.js";
import type { CompiledQuery, Options, Vars } from "./query.js";
import type { Json, JsonPath } from "./ast.js";

export default query;

function silenceErrors<Args extends any[], T>(
  fn: (...args: Args) => T,
  ...args: Args
): T | undefined {
  try {
    return fn(...args);
  } catch (e) {
    if (!(e instanceof QueryError)) {
      throw e;
    }
  }
  return undefined;
}

export function compile(
  path: string | JsonPath,
  options?: Options
): CompiledQuery {
  const parsed = typeof path === "string" ? parse(path) : path;
  return Query.compile(parsed, options);
}

export function query(
  root: Json,
  path: string | JsonPath | CompiledQuery,
  vars?: Vars,
  options?: Options
): Iterable<Json> {
  const compiled = typeof path === "function" ? path : compile(path, options);
  return compiled({ root, vars });
}

export function query_first(
  root: Json,
  path: string | JsonPath | CompiledQuery,
  vars?: Vars,
  options?: Options
): Json | undefined {
  const compiled = typeof path === "function" ? path : compile(path, options);
  if (compiled.silent) {
    const [result] = compiled({ root, vars });
    return result;
  }
  let result;
  for (const value of compiled({ root, vars })) {
    if (result === undefined) {
      result = value;
    }
  }
  return result;
}

export function exists(
  root: Json,
  path: string | JsonPath | CompiledQuery,
  vars?: Vars,
  options?: Options
): boolean | undefined {
  const compiled = typeof path === "function" ? path : compile(path, options);
  return compiled.silent
    ? silenceErrors(
        _exists,
        compiled.CompiledQuery({ root, vars }),
        compiled.strict
      )
    : _exists(compiled({ root, vars }), compiled.strict);
}

function _exists(iter: Iterable<Json>, strict: boolean): boolean | undefined {
  if (!strict) {
    // false if empty
    // true if some not undefined
    // null if every undefined
    let result: boolean | undefined = false;
    for (const value of iter) {
      if (value !== undefined) {
        result = true;
      } else if (result === false) {
        result = undefined;
      }
    }
    return result;
  } else {
    // false if empty
    // true if every not undefined
    // null if some undefined
    let result: boolean | undefined = false;
    for (const value of iter) {
      if (value === undefined) {
        result = undefined;
      } else if (result === false) {
        result = true;
      }
    }
    return result;
  }
}
/*
  if (isExpr(path.expr_or_predicate)) {
    const existsPath = makeJsonPath(path.lax, makeExists(path.expr_or_predicate));
    let result;
    for (result of query(existsPath, root, vars)) {
    }
    return result === true;
  } else {
    let result;
    for (result of query(path, root, vars)) {
    }
    return result !== undefined;
  }
*/

export function match(
  root: Json,
  path: string | JsonPath | CompiledQuery,
  vars?: Vars,
  options?: Options
): boolean | undefined {
  const compiled = typeof path === "function" ? path : compile(path, options);
  return compiled.silent
    ? silenceErrors(_match, compiled({ root, vars }))
    : _match(compiled({ root, vars }));
}

function _match(iter: Iterable<Json>): boolean | undefined {
  let tooMany = false;
  let result;
  for (const value of iter) {
    if (result === undefined) {
      result = value;
    } else {
      tooMany = true;
    }
  }
  if (result === null && !tooMany) {
    return undefined;
  }
  if (typeof result === "boolean" && !tooMany) {
    return result;
  }
  throw new QueryError("single boolean result is expected");
}
