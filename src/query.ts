import type * as ast from "./ast.js";
import type {
  Json,
  Jsonable,
  Expr,
  Predicate,
  ExprOrPredicate,
} from "./ast.js";
import { isExpr, Kind, isJsonable, isPojo } from "./ast.js";
import {
  DateTimeTemplate,
  captureFromDefault,
  datetimeFromCaptureJsonPath,
} from "./datetime.js";
import type { CaptureFunc } from "./datetime.js";
import escapeRegExp from "./escapeRegExp.js";
import translatePosixRegExp, {
  posixFlagsFromLikeRegex,
} from "./translatePosixRegExp.js";

export type Options = {
  inPredicate?: boolean;
  inFilter?: boolean;
  inSubscript?: boolean;
  strict?: boolean;
  silent?: boolean;
  regExp?: "javascript" | "posix";
  getId?: (object: object) => number | undefined;
};

export type Vars = { [key: string]: Json } | null;

export type Context = {
  root: Json;
  vars?: Vars;
  current?: Json | Jsonable | undefined;
  last?: number;
};

export type CompiledQuery = {
  (context: Context): Iterable<Json>;
  CompiledQuery: (context: Context) => Iterable<Json>;
  strict: boolean;
  silent: boolean;
};

export class QueryError extends Error {}

type ContextIterable = (
  context: Context
) => Iterable<Json | Jsonable | undefined>;

type QueryExpr = {
  [K in Expr["kind"]]: (
    node: Extract<Expr, { kind: K }>,
    options: Options
  ) => ContextIterable;
};

type ContextPredicate = (context: Context) => boolean | null;

type QueryPredicate = {
  [K in Predicate["kind"]]: (
    node: Extract<Predicate, { kind: K }>,
    options: Options
  ) => ContextPredicate;
};

type QueryMethod = {
  [K in ast.Method["method"]]: (
    base: ExprOrPredicate,
    options: Options
  ) => ContextIterable;
};

type Comparisons = {
  [K in ast.Comparison["op"]]: (
    left: Json | Jsonable | undefined,
    right: Json | Jsonable | undefined
  ) => boolean | null;
};

function equalTo(
  left: Json | Jsonable | undefined,
  right: Json | Jsonable | undefined
): boolean | null {
  if (left === null || right === null) {
    return left === right;
  }
  if (
    typeof left === "object" ||
    typeof "right" === "object" ||
    typeof left !== typeof right ||
    left === undefined ||
    right === undefined
  ) {
    return null;
  }
  return left === right;
}

function lessThan(
  left: Json | Jsonable | undefined,
  right: Json | Jsonable | undefined
): boolean | null {
  if (left === null || right === null) {
    return false;
  }
  if (
    typeof left === "object" ||
    typeof "right" === "object" ||
    typeof left !== typeof right ||
    left === undefined ||
    right === undefined
  ) {
    return null;
  }
  return left < right;
}

function lessThanEqual(
  left: Json | Jsonable | undefined,
  right: Json | Jsonable | undefined
): boolean | null {
  if (left === null || right === null) {
    return left === right;
  }
  if (
    typeof left === "object" ||
    typeof "right" === "object" ||
    typeof left !== typeof right ||
    left === undefined ||
    right === undefined
  ) {
    return null;
  }
  return left <= right;
}

function* walkAnyPath(
  value: Json | Jsonable | undefined,
  start: number,
  end: number,
  level: number
): Iterable<Json | Jsonable | undefined> {
  const isLast = typeof value !== "object" || value === null;
  if (
    (start === -1 ? isLast : level >= start) &&
    (end === -1 || level <= end)
  ) {
    yield value;
  }
  if (!isLast) {
    if (Array.isArray(value)) {
      for (const element of value) {
        yield* walkAnyPath(element, start, end, level + 1);
      }
    } else {
      for (const element of Object.values(value)) {
        yield* walkAnyPath(element, start, end, level + 1);
      }
    }
  }
}

function* iterNever(): Iterable<never> {}
function* iterOneUndefined(): Iterable<undefined> {
  yield undefined;
}

// Make typescript happy
function makeQuery<
  T extends QueryExpr & QueryPredicate & QueryMethod & Comparisons
>(x: T): T {
  return x;
}

export const Query = makeQuery({
  compile(
    { expr_or_predicate, strict }: ast.JsonPath,
    options?: Options
  ): CompiledQuery {
    const iter = this.ExprOrPredicate(expr_or_predicate, {
      ...options,
      strict,
    });
    function* CompiledQuery(context: Context) {
      const { vars } = context;
      if (typeof vars !== "object" || Array.isArray(vars)) {
        throw new QueryError('"vars" argument is not an object');
      }
      for (const result of iter(context)) {
        yield result === undefined
          ? null
          : isJsonable(result)
          ? result.toJSON()
          : result;
      }
    }
    const compiled = options?.silent
      ? function* CompiledQuerySilent(context: Context) {
          try {
            yield* CompiledQuery(context);
          } catch (e) {
            if (!(e instanceof QueryError)) {
              throw e;
            }
          }
        }
      : CompiledQuery;
    return Object.assign(compiled, {
      CompiledQuery,
      strict,
      silent: Boolean(options?.silent),
    });
  },
  ExprOrPredicate(node: ExprOrPredicate, options: Options): ContextIterable {
    if (isExpr(node)) {
      return this.Expr(node, options);
    }
    const predicate = this.Predicate(node, options);
    return function* iterPredicate(context) {
      yield predicate(context);
    };
  },
  scalars(node: ExprOrPredicate, options: Options): ContextIterable {
    const iter = this.ExprOrPredicate(node, options);
    if (options.strict) {
      return iter;
    }
    return function* iterScalarsLax(context) {
      for (const result of iter(context)) {
        if (Array.isArray(result)) {
          yield* result;
        } else {
          yield result;
        }
      }
    };
  },
  oneExpr(node: Expr, options: Options): ContextIterable {
    const iter = this.scalars(node, options);
    return function* oneExpr(context) {
      let count = 0;
      let result;
      for (const value of iter(context)) {
        if (count++ === 0) {
          result = value;
        }
      }
      yield count === 1 ? result : undefined;
    };
  },
  binaryExprNumeric(
    { left, right }: { left: Expr; right: Expr },
    options: Options,
    operator: (left: number, right: number) => Json | Jsonable | undefined,
    msgIfErrorLeft: string,
    msgIfErrorRight: string
  ): ContextIterable {
    const iterLeft = this.oneExpr(left, options);
    const iterRight = this.oneExpr(right, options);
    const { inPredicate } = options;
    return function* iterBinaryExprNumeric(context) {
      const [leftValue] = iterLeft(context);
      if (typeof leftValue !== "number") {
        if (inPredicate) {
          yield undefined;
        } else {
          throw new QueryError(msgIfErrorLeft);
        }
      } else {
        const [rightValue] = iterRight(context);
        if (typeof rightValue !== "number") {
          if (inPredicate) {
            yield undefined;
          } else {
            throw new QueryError(msgIfErrorRight);
          }
        } else {
          yield operator(leftValue, rightValue);
        }
      }
    };
  },
  Expr(node: Expr, options: Options): ContextIterable {
    return (
      this[node.kind] as (node: Expr, options: Options) => ContextIterable
    )(node, options);
  },
  Predicate(node: Predicate, options: Options): ContextPredicate {
    return (
      this[node.kind] as (node: Predicate, options: Options) => ContextPredicate
    )(node, { ...options, inPredicate: true });
  },
  Literal({ value }: ast.Literal): ContextIterable {
    return function* iterLiteral() {
      yield value;
    };
  },
  Variable({ name }: ast.Variable): ContextIterable {
    return function* iterVariable({ vars }) {
      const value = vars?.[name];
      if (value === undefined) {
        // throw even if silent.
        throw new QueryError(
          `could not find jsonpath variable ${JSON.stringify(name)}`
        );
      }
      yield value;
    };
  },
  // Comparisons
  "==": equalTo,
  "!=": (left, right) => {
    const result = equalTo(left, right);
    return result === null ? null : !result;
  },
  "<=": lessThanEqual,
  ">=": (left, right) => lessThanEqual(right, left),
  "<": lessThan,
  ">": (left, right) => lessThan(right, left),

  // Predicate
  Comparison(
    { op, left, right }: ast.Comparison,
    options: Options
  ): ContextPredicate {
    const compare = this[op];
    const iterLeft = this.scalars(left, options);
    const iterRight = this.scalars(right, options);
    // XXX Need to handle datetimes here
    if (!options.strict) {
      return function predicateComparisonLax(context) {
        let result: boolean | null = false;
        for (const leftJsonPath of iterLeft(context)) {
          for (const rightJsonPath of iterRight(context)) {
            const r = compare(leftJsonPath, rightJsonPath);
            if (r) {
              return true; // XXX short circuit?
            } else if (r === null && result === false) {
              result = null;
            }
          }
        }
        return result;
      };
    } else {
      return function predicateComparisonStrict(context) {
        let result: boolean | null = false;
        for (const leftJsonPath of iterLeft(context)) {
          for (const rightJsonPath of iterRight(context)) {
            const r = compare(leftJsonPath, rightJsonPath);
            if (r === null) {
              return null; // XXX short circuit?
            } else if (r && result === false) {
              result = true;
            }
          }
        }
        return result;
      };
    }
  },
  And({ left, right }: ast.And, options: Options): ContextPredicate {
    const leftPredicate = this.Predicate(left, options);
    const rightPredicate = this.Predicate(right, options);
    return function predicateAnd(context) {
      const leftValue = leftPredicate(context);
      const rightValue = rightPredicate(context);
      return leftValue && rightValue
        ? true
        : leftValue === false || rightValue === false
        ? false
        : null;
    };
  },
  Or({ left, right }: ast.Or, options: Options): ContextPredicate {
    const leftPredicate = this.Predicate(left, options);
    const rightPredicate = this.Predicate(right, options);
    return function predicateOr(context) {
      const leftValue = leftPredicate(context);
      const rightValue = rightPredicate(context);
      return leftValue || rightValue
        ? true
        : leftValue === false && rightValue === false
        ? false
        : null;
    };
  },
  Not({ predicate }: ast.Not, options: Options): ContextPredicate {
    const inner = this.Predicate(predicate, options);
    return function predicateNot(context) {
      const value = inner(context);
      return value === null ? null : !value;
    };
  },
  Exists({ expr }: ast.Exists, options: Options): ContextPredicate {
    const inner = this.Expr(expr, options);
    if (!options.strict) {
      // false if empty
      // true if some not undefined
      // null if every undefined
      return function predicateExistsLax(context) {
        let result: boolean | null = false;
        for (const value of inner(context)) {
          if (value !== undefined) {
            result = true;
          } else if (result === false) {
            result = null;
          }
        }
        return result;
      };
    } else {
      // false if empty
      // true if every not undefined
      // null if some undefined
      return function predicateExistsLax(context) {
        let result: boolean | null = false;
        for (const value of inner(context)) {
          if (value === undefined) {
            result = null;
          } else if (result === false) {
            result = true;
          }
        }
        return result;
      };
    }
  },
  IsUnknown({ predicate }: ast.IsUnknown, options: Options): ContextPredicate {
    const inner = this.Predicate(predicate, options);
    return function predicateIsUnknown(context) {
      return inner(context) === null;
    };
  },
  StartsWith(
    { expr, initial }: ast.StartsWith,
    options: Options
  ): ContextPredicate {
    const iterSearchString = this.oneExpr(initial, options);
    const inner = this.scalars(expr, options);
    if (!options.strict) {
      return function predicateStartsWithLax(context) {
        const [searchString] = iterSearchString(context);
        if (typeof searchString !== "string") {
          return null;
        }
        // XXX how should this be handling multiple results?
        let result: boolean | null = false;
        for (const valueOrJsonable of inner(context)) {
          const value = isJsonable(valueOrJsonable)
            ? valueOrJsonable.toJSON()
            : valueOrJsonable;
          if (typeof value === "string") {
            if (value.startsWith(searchString)) {
              return true; // XXX short circuit?
            }
          } else {
            result = null;
          }
        }
        return result;
      };
    } else {
      return function predicateStartsWithStrict(context) {
        const [searchString] = iterSearchString(context);
        if (typeof searchString !== "string") {
          return null;
        }
        // XXX how should this be handling multiple results?
        let result: boolean | null = false;
        for (const valueOrJsonable of inner(context)) {
          const value = isJsonable(valueOrJsonable)
            ? valueOrJsonable.toJSON()
            : valueOrJsonable;
          if (typeof value === "string") {
            if (value.startsWith(searchString)) {
              result = true;
            }
          } else {
            return null; // XXX short circuit?
          }
        }
        return result;
      };
    }
  },
  LikeRegex(
    { pattern, flags, expr }: ast.LikeRegex,
    options: Options
  ): ContextPredicate {
    if (flags.includes("x")) {
      throw new Error(
        'XQuery "x" flag (expanded regular expressions) is not implemented'
      );
    }
    const re = flags.includes("q")
      ? new RegExp(escapeRegExp(pattern), "u" + flags.replace(/q/g, ""))
      : options.regExp === "posix"
      ? translatePosixRegExp(pattern, posixFlagsFromLikeRegex(flags))
      : new RegExp(pattern, "u" + flags);
    const inner = this.scalars(expr, options);
    return function predicateLikeRegex(context) {
      for (const result of inner(context)) {
        const value = isJsonable(result) ? result.toJSON() : result;
        if (typeof value === "string" && re.test(value)) {
          return true; // XXX short circuit?
        }
      }
      return false;
    };
  },
  // Expr
  Root(): ContextIterable {
    return function* iterRoot({ root }) {
      yield root;
    };
  },
  Current({}: ast.Current, { inFilter }: Options): ContextIterable {
    if (!inFilter) {
      throw new QueryError("@ is not allowed in root expressions");
    }
    return function* iterCurrent({ current }) {
      yield current;
    };
  },
  Last({}: ast.Last, { inSubscript }: Options): ContextIterable {
    if (!inSubscript) {
      throw new QueryError("LAST is allowed only in array subscripts");
    }
    return function* iterLast({ last }) {
      yield last as number;
    };
  },
  Plus({ expr }: ast.Plus, options: Options): ContextIterable {
    const inner = this.scalars(expr, options);
    const notNumber = options.inPredicate
      ? () => undefined
      : () => {
          throw new QueryError(
            "operand of unary jsonpath operator + is not a numeric value"
          );
        };
    return function* iterPlus(context) {
      for (const value of inner(context)) {
        yield typeof value === "number" ? +value : notNumber();
      }
    };
  },
  Minus({ expr }: ast.Minus, options: Options): ContextIterable {
    const inner = this.scalars(expr, options);
    const notNumber = options.inPredicate
      ? () => undefined
      : () => {
          throw new QueryError(
            "operand of unary jsonpath operator - is not a numeric value"
          );
        };
    return function* iterMinus(context) {
      for (const value of inner(context)) {
        yield typeof value === "number" ? -value : notNumber();
      }
    };
  },
  Add(node: ast.Add, options: Options): ContextIterable {
    return this.binaryExprNumeric(
      node,
      options,
      (leftValue, rightValue) => leftValue + rightValue,
      "left operand of jsonpath operator + is not a single numeric value",
      "right operand of jsonpath operator + is not a single numeric value"
    );
  },
  Sub(node: ast.Sub, options: Options): ContextIterable {
    return this.binaryExprNumeric(
      node,
      options,
      (leftValue, rightValue) => leftValue - rightValue,
      "left operand of jsonpath operator - is not a single numeric value",
      "right operand of jsonpath operator - is not a single numeric value"
    );
  },
  Mul(node: ast.Mul, options: Options): ContextIterable {
    return this.binaryExprNumeric(
      node,
      options,
      (leftValue, rightValue) => leftValue * rightValue,
      "left operand of jsonpath operator * is not a single numeric value",
      "right operand of jsonpath operator * is not a single numeric value"
    );
  },
  Div(node: ast.Div, options: Options): ContextIterable {
    const operator = options.inPredicate
      ? (leftValue: number, rightValue: number) => {
          if (rightValue === 0) {
            return undefined;
          } else {
            return leftValue / rightValue;
          }
        }
      : (leftValue: number, rightValue: number) => {
          if (rightValue === 0) {
            throw new QueryError("division by zero");
          } else {
            return leftValue / rightValue;
          }
        };
    return this.binaryExprNumeric(
      node,
      options,
      operator,
      "left operand of jsonpath operator / is not a single numeric value",
      "right operand of jsonpath operator / is not a single numeric value"
    );
  },
  Mod(node: ast.Mod, options: Options): ContextIterable {
    const operator = options.inPredicate
      ? (leftValue: number, rightValue: number) => {
          if (rightValue === 0) {
            return undefined;
          } else {
            return leftValue % rightValue;
          }
        }
      : (leftValue: number, rightValue: number) => {
          if (rightValue === 0) {
            throw new QueryError("division by zero");
          } else {
            return leftValue % rightValue;
          }
        };
    return this.binaryExprNumeric(
      node,
      options,
      operator,
      "left operand of jsonpath operator % is not a single numeric value",
      "right operand of jsonpath operator % is not a single numeric value"
    );
  },
  //Accessor
  Key({ base, key }: ast.Key, options: Options): ContextIterable {
    const iterBase = this.scalars(base, options);
    if (key === null) {
      const nonPojo =
        !options.strict || options.inPredicate
          ? () => {}
          : () => {
              throw new QueryError(
                "jsonpath wildcard member accessor can only be applied to an object"
              );
            };
      return function* iterWildcardMemberAccessor(context) {
        for (const result of iterBase(context)) {
          if (isPojo(result)) {
            yield* Object.values(result);
          } else {
            nonPojo(); // XXX should this yield undefined when strict inPredicate?
          }
        }
      };
    }
    const notDefined = !options.strict
      ? iterNever
      : options.inPredicate
      ? iterOneUndefined
      : (key: string) => {
          throw new QueryError(
            `JSON object does not contain key ${JSON.stringify(key)}`
          );
        };
    const nonPojo = !options.strict
      ? iterNever
      : options.inPredicate
      ? iterOneUndefined
      : () => {
          throw new QueryError(
            "jsonpath member accessor can only be applied to an object"
          );
        };
    return function* iterMemberAccessor(context) {
      for (const result of iterBase(context)) {
        if (isPojo(result)) {
          const value = result[key];
          if (value !== undefined) {
            yield value;
          } else {
            yield* notDefined(key);
          }
        } else {
          yield* nonPojo();
        }
      }
    };
  },
  Index({ base, elements }: ast.Index, options: Options): ContextIterable {
    const notArrayMsg =
      elements === null
        ? "jsonpath wildcard array accessor can only be applied to an array"
        : "jsonpath array accessor can only be applied to an array";
    const iterBase = this.ExprOrPredicate(base, options);
    const ensureArray: (
      currentValue: Json | Jsonable | undefined
    ) => Json[] | Jsonable[] | undefined = !options.strict
      ? (currentValue) =>
          Array.isArray(currentValue)
            ? currentValue
            : ([currentValue] as Json[] | Jsonable[])
      : options.inPredicate
      ? (currentValue) => {
          if (Array.isArray(currentValue)) {
            return currentValue;
          } else {
            return undefined;
          }
        }
      : (currentValue) => {
          if (Array.isArray(currentValue)) {
            return currentValue;
          } else {
            throw new QueryError(notArrayMsg);
          }
        };
    if (elements === null) {
      return function* iterWildcardArrayAccessor(context) {
        for (const result of iterBase(context)) {
          const array = ensureArray(result);
          if (array === undefined) {
            yield undefined;
          } else {
            yield* array;
          }
        }
      };
    }
    const indices = this.indices(elements, options);
    const onIndexUndefined = !options.inPredicate
      ? () => {
          throw new QueryError(
            "jsonpath array subscript is not a single numeric value"
          );
        }
      : !options.strict
      ? iterNever
      : iterOneUndefined;
    const onBadInteger = !options.inPredicate
      ? () => {
          throw new QueryError(
            "jsonpath array subscript is out of integer range"
          );
        }
      : iterOneUndefined;
    const onUndefined = !options.strict
      ? iterNever
      : options.inPredicate
      ? iterOneUndefined
      : () => {
          throw new QueryError("jsonpath array subscript is out of bounds");
        };
    return function* iterArrayAccessor(context) {
      for (const result of iterBase(context)) {
        const array = ensureArray(result);
        if (array === undefined) {
          yield undefined;
        } else {
          const last = array.length - 1;
          for (const index of indices({ ...context, last })) {
            if (index === undefined) {
              yield* onIndexUndefined();
            } else if (index < -(2 ** 32) || index > 2 ** 32 - 1) {
              yield* onBadInteger();
            } else {
              const value = array[index];
              if (value === undefined) {
                yield* onUndefined();
              } else {
                yield value;
              }
            }
          }
        }
      }
    };
  },
  indices(
    elements: Array<Expr | ast.To>,
    options: Options
  ): (context: Context) => Iterable<number | undefined> {
    const elementOptions = { ...options, inSubscript: true };
    const elementIters = elements.map((element) =>
      element.kind === Kind.To
        ? this.To(element, elementOptions)
        : this.indexExpr(element, elementOptions)
    );
    return function* iterIndices(context) {
      for (const elementIter of elementIters) {
        yield* elementIter(context);
      }
    };
  },
  indexExpr(
    element: ast.Expr,
    options: Options
  ): (context: Context) => Iterable<number | undefined> {
    const iterOne = this.oneExpr(element, options);
    return function* iterIndexExpr(context) {
      const [value] = iterOne(context);
      yield typeof value === "number" ? Math.floor(value) : undefined;
    };
  },
  To(
    { start, end }: ast.To,
    options: Options
  ): (context: Context) => Iterable<number | undefined> {
    const startExpr = this.oneExpr(start, options);
    const endExpr = this.oneExpr(end, options);
    return function* iterTo(context) {
      const [startAt] = startExpr(context);
      if (typeof startAt !== "number") {
        yield undefined;
      } else {
        const [endAt] = endExpr(context);
        if (typeof endAt !== "number") {
          yield undefined;
        } else {
          for (let i = Math.floor(startAt); i <= Math.floor(endAt); i++) {
            yield i;
          }
        }
      }
    };
  },
  AnyPath(
    { base, start, end }: ast.AnyPath,
    options: Options
  ): ContextIterable {
    const iterBase = this.ExprOrPredicate(base, options);
    return function* iterAnyPath(context) {
      for (const result of iterBase(context)) {
        yield* walkAnyPath(result, start, end, 0);
      }
    };
  },
  Filter({ base, predicate }: ast.Filter, options: Options): ContextIterable {
    const iterBase = this.scalars(base, options);
    const inner = this.Predicate(predicate, { ...options, inFilter: true });
    return function* iterFilter(context) {
      for (const current of iterBase(context)) {
        if (inner({ ...context, current })) {
          yield current;
        }
      }
    };
  },
  DateTime(
    { base, template }: ast.DateTime,
    options: Options
  ): ContextIterable {
    let capture: CaptureFunc;
    if (template !== null) {
      const compiled = DateTimeTemplate.compile(template);
      if (!compiled) {
        throw new QueryError(
          `datetime format is not recognized: ${JSON.stringify(template)}`
        );
      } else {
        capture = compiled.exec.bind(compiled);
      }
    } else {
      capture = captureFromDefault;
    }
    const dtUndefined = options.inPredicate
      ? () => undefined
      : (value: string) => {
          throw new QueryError(
            `datetime format is not recognized: ${JSON.stringify(value)}`
          );
        };
    return this.scalarMethod(
      (value) => {
        if (typeof value !== "string") {
          throw new QueryError(
            "jsonpath item method .datetime() can only be applied to a string"
          );
        }
        const result = capture(value);
        const dt = datetimeFromCaptureJsonPath(result);
        if (dt !== undefined) {
          return dt;
        } else {
          return dtUndefined(value);
        }
      },
      base,
      options
    );
  },
  Method({ base, method }: ast.Method, options: Options): ContextIterable {
    return this[method](base, options);
  },
  abs(base: ExprOrPredicate, options: Options): ContextIterable {
    return this.numericScalarMethod("abs", Math.abs, base, options);
  },
  floor(base: ExprOrPredicate, options: Options): ContextIterable {
    return this.numericScalarMethod("floor", Math.floor, base, options);
  },
  ceiling(base: ExprOrPredicate, options: Options): ContextIterable {
    return this.numericScalarMethod("ceiling", Math.ceil, base, options);
  },
  double(base: ExprOrPredicate, options: Options): ContextIterable {
    return this.scalarMethod(
      (value) => {
        if (typeof value === "number") {
          if (Number.isFinite(value)) {
            return value;
          } else {
            throw new QueryError(
              "numeric argument of jsonpath item method .double() is out of range for type double precision"
            );
          }
        } else if (typeof value === "string") {
          const n = Number(value);
          if (Number.isFinite(n)) {
            return n;
          } else {
            throw new QueryError(
              "string argument of jsonpath item method .double() is not a valid representation of a double precision number"
            );
          }
        } else {
          throw new QueryError(
            "jsonpath item method .double() can only be applied to a string or numeric value"
          );
        }
      },
      base,
      options
    );
  },
  numericScalarMethod(
    name: string,
    numericFn: (value: number) => number,
    base: ExprOrPredicate,
    options: Options
  ): ContextIterable {
    const msgIfError = `jsonpath item method .${name}() can only be applied to a numeric value`;
    return this.scalarMethod(
      (value) => {
        if (typeof value === "number") {
          return numericFn(value);
        } else {
          throw new QueryError(msgIfError);
        }
      },
      base,
      options
    );
  },
  scalarMethod(
    fn: (
      value: Json | Jsonable | undefined
    ) => Json | Jsonable | undefined | undefined,
    base: ExprOrPredicate,
    options: Options
  ): ContextIterable {
    const iterBase = this.scalars(base, options);
    return function* iterScalarMethod(context) {
      for (const result of iterBase(context)) {
        const scalarJsonPath = fn(result);
        if (scalarJsonPath !== undefined) {
          yield scalarJsonPath;
        }
      }
    };
  },
  size(base: ExprOrPredicate, options: Options): ContextIterable {
    const iterBase = this.ExprOrPredicate(base, options);
    const nonArray = !options.strict
      ? () => 1
      : options.inPredicate
      ? () => undefined
      : () => {
          throw new QueryError(
            "jsonpath item method .size() can only be applied to an array"
          );
        };
    return function* iterSize(context) {
      for (let result of iterBase(context)) {
        yield Array.isArray(result) ? result.length : nonArray();
      }
    };
  },
  type(base: ExprOrPredicate, options: Options): ContextIterable {
    const iterBase = this.ExprOrPredicate(base, options);
    return function* iterType(context) {
      for (const result of iterBase(context)) {
        yield result === null
          ? "null"
          : Array.isArray(result)
          ? "array"
          : isJsonable(result)
          ? result.type()
          : typeof result;
      }
    };
  },
  keyvalue(base: ExprOrPredicate, options: Options): ContextIterable {
    const iterBase = this.scalars(base, options);
    const nonPojo = options.inPredicate
      ? () => undefined
      : () => {
          throw new QueryError(
            "jsonpath item method .keyvalue() can only be applied to an object"
          );
        };
    const { getId } = options; // XXX should this be in context instead?
    const keyvalues: (object: object) => Json[] = getId
      ? (object) => {
          const id = getId(object);
          return Object.entries(object).map(([key, value]) => ({
            id,
            key,
            value,
          }));
        }
      : (object) =>
          Object.entries(object).map(([key, value]) => ({ key, value }));
    return function* iterKeyValueWithId(context) {
      for (const result of iterBase(context)) {
        if (isPojo(result)) {
          yield* keyvalues(result);
        } else {
          yield nonPojo();
        }
      }
    };
  },
});
