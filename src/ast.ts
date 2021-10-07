export const PredicateKind = {
  Exists: "Exists",
  Comparison: "Comparison",
  And: "And",
  Or: "Or",
  Not: "Not",
  IsUnknown: "IsUnknown",
  StartsWith: "StartsWith",
  LikeRegex: "LikeRegex",
} as const;

export const ExprKind = {
  Literal: "Literal",
  Variable: "Variable",
  Root: "Root",
  Current: "Current",
  Last: "Last",
  Plus: "Plus",
  Minus: "Minus",
  Add: "Add",
  Sub: "Sub",
  Mul: "Mul",
  Div: "Div",
  Mod: "Mod",
  Key: "Key",
  AnyPath: "AnyPath",
  Method: "Method",
  DateTime: "DateTime",
  Filter: "Filter",
  Index: "Index",
} as const;

export const Kind = {
  ...PredicateKind,
  ...ExprKind,
  JsonPath: "JsonPath",
  To: "To",
} as const;

export type Primitive = string | number | boolean | null;
export type Json = Primitive | Array<Json> | Pojo;
export type Pojo = { [key: string]: Json };

export function isPojo(value: unknown): value is Pojo {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export type Jsonable = { type(): string; toJSON(): Json };

export function isJsonable(value: unknown): value is Jsonable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Jsonable).toJSON === "function"
  );
}

export type Node = Expr | Predicate | JsonPath | To;

export function isPredicate(node: Node): node is Predicate {
  return (
    typeof node === "object" && node !== null && node.kind in PredicateKind
  );
}

export function isExpr(node: Node): node is Expr {
  return typeof node !== "object" || node === null || node.kind in ExprKind;
}

export type JsonPath = {
  kind: typeof Kind.JsonPath;
  strict: boolean;
  expr_or_predicate: ExprOrPredicate;
};
export function makeJsonPath(
  expr_or_predicate: ExprOrPredicate,
  strict: boolean = false
): JsonPath {
  return { kind: Kind.JsonPath, strict, expr_or_predicate };
}

export type ExprOrPredicate = Expr | Predicate;

export type Literal = {
  kind: typeof Kind.Literal;
  value: Primitive;
};
export function makeLiteral(value: Literal["value"]): Literal {
  return { kind: Kind.Literal, value };
}

export type Variable = { kind: typeof Kind.Variable; name: string };
export function makeVariable(name: string): Variable {
  return { kind: Kind.Variable, name };
}

export type Predicate =
  | Exists
  | Comparison
  | And
  | Or
  | Not
  | IsUnknown
  | StartsWith
  | LikeRegex;

export type Exists = { kind: typeof Kind.Exists; expr: Expr };
export function makeExists(expr: Expr): Exists {
  return { kind: Kind.Exists, expr };
}

export type Comparison = {
  kind: typeof Kind.Comparison;
  op: "==" | "!=" | "<" | ">" | "<=" | ">=";
  left: Expr;
  right: Expr;
};
export function makeComparison(
  op: Comparison["op"],
  left: Expr,
  right: Expr
): Comparison {
  return { kind: Kind.Comparison, op, left, right };
}

export type And = { kind: typeof Kind.And; left: Predicate; right: Predicate };
export function makeAnd(left: Predicate, right: Predicate): And {
  return { kind: Kind.And, left, right };
}

export type Or = { kind: typeof Kind.Or; left: Predicate; right: Predicate };
export function makeOr(left: Predicate, right: Predicate): Or {
  return { kind: Kind.Or, left, right };
}

export type Not = { kind: typeof Kind.Not; predicate: Predicate };
export function makeNot(predicate: Predicate): Not {
  return { kind: Kind.Not, predicate };
}

export type LikeRegex = {
  kind: typeof Kind.LikeRegex;
  pattern: string;
  flags: string;
  expr: Expr;
};
export function makeLikeRegex(
  expr: Expr,
  pattern: string,
  flags: string
): LikeRegex {
  //The optional flag string may include one or more of the characters i for case-insensitive match, m to allow ^ and $ to match at newlines, s to allow . to match a newline, and q to quote the whole pattern (reducing the behavior to a simple substring match).
  for (const c of flags) {
    if (!"imsqx".includes(c)) {
      throw new Error(`unknown flag ${JSON.stringify(c)}`);
    }
  }
  return { kind: Kind.LikeRegex, pattern, flags, expr };
}

export type Root = { kind: typeof Kind.Root };
export function makeRoot(): Root {
  return { kind: Kind.Root };
}

export type Current = { kind: typeof Kind.Current };
export function makeCurrent(): Current {
  return { kind: Kind.Current };
}

export type Last = { kind: typeof Kind.Last };
export function makeLast(): Last {
  return { kind: Kind.Last };
}

export type Expr =
  | Literal
  | Variable
  | Root
  | Current
  | Last
  | Accessor
  | Plus
  | Minus
  | Add
  | Sub
  | Mul
  | Div
  | Mod;

export type Plus = { kind: typeof Kind.Plus; expr: Expr };
export function makePlus(expr: Expr): Plus | number {
  if (typeof expr === "number") {
    return expr;
  }
  return { kind: Kind.Plus, expr };
}

export type Minus = { kind: typeof Kind.Minus; expr: Expr };
export function makeMinus(expr: Expr): Minus | number {
  if (typeof expr === "number") {
    return -expr;
  }
  return { kind: Kind.Minus, expr };
}

export type Add = { kind: typeof Kind.Add; left: Expr; right: Expr };
export function makeAdd(left: Expr, right: Expr): Add {
  return { kind: Kind.Add, left, right };
}

export type Sub = { kind: typeof Kind.Sub; left: Expr; right: Expr };
export function makeSub(left: Expr, right: Expr): Sub {
  return { kind: Kind.Sub, left, right };
}

export type Mul = { kind: typeof Kind.Mul; left: Expr; right: Expr };
export function makeMul(left: Expr, right: Expr): Mul {
  return { kind: Kind.Mul, left, right };
}

export type Div = { kind: typeof Kind.Div; left: Expr; right: Expr };
export function makeDiv(left: Expr, right: Expr): Div {
  return { kind: Kind.Div, left, right };
}

export type Mod = { kind: typeof Kind.Mod; left: Expr; right: Expr };
export function makeMod(left: Expr, right: Expr): Mod {
  return { kind: Kind.Mod, left, right };
}

export type Accessor = Key | Index | AnyPath | Method | DateTime | Filter;

export type Key = {
  kind: typeof Kind.Key;
  base: ExprOrPredicate;
  key: string | null;
};
export function makeKey(base: ExprOrPredicate, key: string | null): Key {
  return { kind: Kind.Key, base, key };
}

export type To = { kind: typeof Kind.To; start: Expr; end: Expr };
export function makeTo(start: Expr, end: Expr): To {
  return { kind: Kind.To, start, end };
}

export type Index = {
  kind: typeof Kind.Index;
  base: ExprOrPredicate;
  elements: null | [Expr | To, ...Array<Expr | To>];
};
export function makeIndex(
  base: ExprOrPredicate,
  elements: Index["elements"]
): Index {
  return { kind: Kind.Index, base, elements };
}

export type AnyPath = {
  kind: typeof Kind.AnyPath;
  base: ExprOrPredicate;
  start: number;
  end: number;
};
export function makeAnyPath(
  base: ExprOrPredicate,
  start: number,
  end: number
): AnyPath {
  return { kind: Kind.AnyPath, base, start, end };
}

export type Method = {
  kind: typeof Kind.Method;
  base: ExprOrPredicate;
  method: "abs" | "size" | "type" | "floor" | "double" | "ceiling" | "keyvalue";
};
export function makeMethod(
  base: ExprOrPredicate,
  method: Method["method"]
): Method {
  return { kind: Kind.Method, base, method };
}

export type DateTime = {
  kind: typeof Kind.DateTime;
  base: ExprOrPredicate;
  template: string | null;
};
export function makeDateTime(
  base: ExprOrPredicate,
  template: string | null
): DateTime {
  return { kind: Kind.DateTime, base, template };
}

export type Filter = {
  kind: typeof Kind.Filter;
  base: ExprOrPredicate;
  predicate: Predicate;
};
export function makeFilter(
  base: ExprOrPredicate,
  predicate: Predicate
): Filter {
  return { kind: Kind.Filter, base, predicate };
}

export type IsUnknown = { kind: typeof Kind.IsUnknown; predicate: Predicate };
export function makeIsUnknown(predicate: Predicate): IsUnknown {
  return { kind: Kind.IsUnknown, predicate };
}

type StringLiteral = {
  kind: typeof Kind.Literal;
  value: string;
};

export type StartsWith = {
  kind: typeof Kind.StartsWith;
  expr: Expr;
  initial: StringLiteral | Variable;
};
export function makeStartsWith(
  expr: Expr,
  initial: StringLiteral | Variable
): StartsWith {
  return { kind: Kind.StartsWith, expr, initial };
}
