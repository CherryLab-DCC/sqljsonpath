import type * as ast from "./ast.js";
import { Kind } from "./ast.js";

type SerializeNode = {
  [K in ast.Node["kind"]]: (node: Extract<ast.Node, { kind: K }>) => string;
};

const maxPrecedence = 9;

const Precedence: { [K in ast.Node["kind"]]: number } = {
  JsonPath: 0,
  Literal: maxPrecedence,
  Variable: maxPrecedence,
  Root: maxPrecedence,
  Current: maxPrecedence,
  Last: maxPrecedence,
  Key: maxPrecedence,
  Plus: 6,
  Minus: 6,
  Add: 4,
  Sub: 4,
  Mul: 5,
  Div: 5,
  Mod: 5,
  Exists: maxPrecedence,
  Comparison: 3,
  And: 2,
  Or: 1,
  Not: maxPrecedence,
  IsUnknown: maxPrecedence,
  StartsWith: maxPrecedence,
  LikeRegex: maxPrecedence,
  AnyPath: maxPrecedence,
  Method: maxPrecedence,
  DateTime: maxPrecedence,
  Filter: maxPrecedence,
  Index: maxPrecedence,
  To: 0,
} as const;

export class Serializer implements SerializeNode {
  serialize(
    node: ast.Node,
    outerKind: ast.Node["kind"] = Kind.JsonPath
  ): string {
    // https://stackoverflow.com/questions/56781010/typescript-how-to-map-objects-in-a-discriminated-union-to-functions-they-can-be
    // https://github.com/microsoft/TypeScript/issues/30581
    const s = (this[node.kind] as (node: ast.Node) => string)(node);
    return Precedence[node.kind] >= Precedence[outerKind] ? s : `(${s})`;
  }
  identifier(name: string): string {
    const other =
      /^[^\?\%\$\.\[\]\{\}\(\)\|\&\!\=\<\>\@\#\,\*:\-\+\/\\\" \t\n\r\f]+$/;
    return other.test(name) ? name : JSON.stringify(name);
  }
  JsonPath({ kind, strict, expr_or_predicate }: ast.JsonPath): string {
    return `${strict ? "strict " : ""}${this.serialize(
      expr_or_predicate,
      kind
    )}`;
  }
  Literal({ value }: ast.Literal): string {
    return JSON.stringify(value);
  }
  Variable({ name }: ast.Variable): string {
    return `$${this.identifier(name)}`;
  }
  // Predicate
  Exists({ expr }: ast.Exists): string {
    return `exists (${this.serialize(expr)})`;
  }
  Comparison({ kind, op, left, right }: ast.Comparison): string {
    return `${this.serialize(left, kind)} ${op} ${this.serialize(right, kind)}`;
  }
  And({ kind, left, right }: ast.And): string {
    return `${this.serialize(left, kind)} && ${this.serialize(right, kind)}`;
  }
  Or({ kind, left, right }: ast.Or): string {
    return `${this.serialize(left, kind)} || ${this.serialize(right, kind)}`;
  }
  Not({ predicate }: ast.Not): string {
    const s = this.serialize(predicate);
    return predicate.kind === Kind.Exists ? `!${s}` : `!(${s})`;
  }
  IsUnknown({ predicate }: ast.IsUnknown): string {
    return `(${this.serialize(predicate)}) is unknown`;
  }
  StartsWith({ kind, expr, initial }: ast.StartsWith): string {
    return `${this.serialize(expr, kind)} starts with ${this.serialize(
      initial,
      kind
    )}`;
  }
  LikeRegex({ kind, pattern, flags, expr }: ast.LikeRegex): string {
    const s = `${this.serialize(expr, kind)} like_regex ${JSON.stringify(
      pattern
    )}`;
    return flags ? `${s} flag ${JSON.stringify(flags)}` : s;
  }
  // Expr
  Root({}: ast.Root): string {
    return "$";
  }
  Current({}: ast.Current): string {
    return "@";
  }
  Last({}: ast.Last): string {
    return "last";
  }
  Plus({ kind, expr }: ast.Plus): string {
    return `+${this.serialize(expr, kind)}`;
  }
  Minus({ kind, expr }: ast.Minus): string {
    return `-${this.serialize(expr, kind)}`;
  }
  Add({ kind, left, right }: ast.Add): string {
    return `${this.serialize(left, kind)} + ${this.serialize(right, kind)}`;
  }
  Sub({ kind, left, right }: ast.Sub): string {
    return `${this.serialize(left, kind)} - ${this.serialize(right, kind)}`;
  }
  Mul({ kind, left, right }: ast.Mul): string {
    return `${this.serialize(left, kind)} * ${this.serialize(right, kind)}`;
  }
  Div({ kind, left, right }: ast.Div): string {
    return `${this.serialize(left, kind)} / ${this.serialize(right, kind)}`;
  }
  Mod({ kind, left, right }: ast.Mod): string {
    return `${this.serialize(left, kind)} % ${this.serialize(right, kind)}`;
  }
  //Accessor
  // XXX ensure base expr is in parens
  Key({ kind, base, key }: ast.Key): string {
    return `${this.serialize(base, kind)}.${
      key === null ? "*" : this.identifier(key)
    }`;
  }
  Index({ kind, base, elements }: ast.Index): string {
    return `${this.serialize(base, kind)}[${
      elements === null
        ? "*"
        : elements.map((element) => this.serialize(element)).join(", ")
    }]`;
  }
  To({ start, end }: ast.To): string {
    return `${this.serialize(start)} to ${this.serialize(end)}`;
  }
  AnyPath({ kind, base, start, end }: ast.AnyPath): string {
    const level =
      start === 0 && end === -1
        ? ""
        : start === -1 && end === -1
        ? "{last}"
        : start === end
        ? `{${start}}`
        : `{${start} to ${end === -1 ? "last" : end}}`;
    return `${this.serialize(base, kind)}.**${level}`;
  }
  Method({ kind, base, method }: ast.Method): string {
    return `${this.serialize(base, kind)}.${method}()`;
  }
  DateTime({ kind, base, template }: ast.DateTime): string {
    return `${this.serialize(base, kind)}.datetime(${
      template === null ? "" : JSON.stringify(template)
    })`;
  }
  Filter({ kind, base, predicate }: ast.Filter): string {
    return `${this.serialize(base, kind)} ? (${this.serialize(predicate)})`;
  }
}

const serializer = new Serializer();
export default serializer.serialize.bind(serializer);
