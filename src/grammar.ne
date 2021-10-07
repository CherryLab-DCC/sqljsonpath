# https://www.wiscorp.com/pub/DM32.2-2014-00025r1-sql-json-part-2.pdf
# And postgres source code

@preprocessor typescript

@{%
import lexer from "./lexer.js";
import * as ast from "./ast.js";
%}

@lexer lexer

JsonPath -> mode _ ExprOrPredicate _		{% ([mode,, expr_or_predicate]) => ast.makeJsonPath(expr_or_predicate, mode) %}

ExprOrPredicate
	-> Expr								{% id %}
	| Predicate							{% id %}

mode
	-> _ %strict						{% () => true %}
	| _ %lax							{% () => false %}
	| null								{% () => false %}

string -> %startxq %string:* %endxq		{% ([, tokens]) => tokens.join("") %}

Variable
	-> %variable						{% ([token]) => ast.makeVariable(token.value) %}
	| %startxvq %varq:* %endxvq			{% ([, tokens]) => ast.makeVariable(tokens.join("")) %}

StringLiteral -> string					{% ([string]) => ast.makeLiteral(string) %} 

Literal
	-> StringLiteral					{% id %}
	| %null								{% () => ast.makeLiteral(null) %}
	| %true								{% () => ast.makeLiteral(true) %}
	| %false							{% () => ast.makeLiteral(false) %}
	| (%numeric | %int | %intexp)		{% ([[token]]) => ast.makeLiteral(Number(token)) %}

delimited_predicate
	-> "(" _ Predicate _ ")"			{% ([,, predicate]) => predicate %}
	| %exists _ "(" _ Expr _ ")"		{% ([,,,, expr]) => ast.makeExists(expr) %}

Predicate -> Or							{% id %}

Or
	-> And								{% id %}
	| And _ %or _ Or					{% ([left,,,, right]) => ast.makeOr(left, right) %}

And
	-> other_predicate					{% id %}
	| other_predicate _ %and _ And		{% ([left,,,, right]) => ast.makeAnd(left, right) %}

other_predicate
	-> delimited_predicate				{% id %}
	| Expr _ %comp_op _ Expr			{% ([left,, op,, right]) => ast.makeComparison(op.value, left, right) %}
	| %not _ delimited_predicate		{% ([,, predicate]) => ast.makeNot(predicate) %}
	| "(" _ Predicate _ ")" _ %is _ %unknown
										{% ([,, predicate]) => ast.makeIsUnknown(predicate) %}
	| Expr _ %starts _ %with _ starts_with_initial
										{% ([expr,,,,,, initial]) => ast.makeStartsWith(expr, initial) %}
	| Expr _ %like_regex _ string		{% ([expr,,,, regex]) => ast.makeLikeRegex(expr, regex, "") %}
	| Expr _ %like_regex _ string _ %flag _ string
										{% ([expr,,,, regex,,,, flag]) => ast.makeLikeRegex(expr, regex, flag) %}

starts_with_initial
	-> StringLiteral					{% id %}
	| Variable							{% id %}

Expr -> Additive						{% id %}

Additive
	-> Multiplicative					{% id %}
	| Multiplicative _ "+" _ Additive	{% ([left,,,,right]) => ast.makeAdd(left, right) %}
	| Multiplicative _ "-" _ Additive	{% ([left,,,,right]) => ast.makeSub(left, right) %}

Multiplicative
	-> Unary     {% id %}
	| Unary _ "*" _ Multiplicative		{% ([left,,,,right]) => ast.makeMul(left, right) %}
	| Unary _ "/" _ Multiplicative		{% ([left,,,,right]) => ast.makeDiv(left, right) %}
	| Unary _ "%" _ Multiplicative		{% ([left,,,,right]) => ast.makeMod(left, right) %}

Unary
	-> Accessor							{% id %}
	| "(" _ Expr _ ")"					{% ([,, expr]) => expr %}
	| "+" _ Unary						{% ([,, expr]) => ast.makePlus(expr) %}
	| "-" _ Unary						{% ([,, expr]) => ast.makeMinus(expr) %}

Accessor
	-> path_primary						{% id %}
	| base _ "." _ key					{% ([base, ,,, key]) => ast.makeKey(base, key) %}
	| base _ "." _ "*"					{% ([base]) => ast.makeKey(base, null) %}
	| base _ "[" _ "*" _ "]"			{% ([base]) => ast.makeIndex(base, null) %}
	| base _ "[" _ index_list _ "]"		{% ([base, ,,, index_list]) => ast.makeIndex(base, index_list) %}
	| base _ "." _ method _ "(" _ ")"	{% ([base, ,,, method]) => ast.makeMethod(base, method) %}
	| base _ "." _ %datetime _ "(" _ string:? _ ")"
										{% ([base, ,,,,,,, template]) => ast.makeDateTime(base, template) %}
	| AnyPath							{% id %}
	| base _ "?" _ "(" _ Predicate _ ")"
										{% ([base, ,,,,, predicate]) => ast.makeFilter(base, predicate) %}

base
	-> "(" _ ExprOrPredicate _ ")"		{% ([,, expr_or_predicate]) => expr_or_predicate %}
	| Accessor							{% id %}

path_primary
	-> Literal							{% id %}
	| Variable							{% id %}
	| "$"								{% () => ast.makeRoot() %}
	| "@"								{% () => ast.makeCurrent() %}
	| %last								{% () => ast.makeLast() %}

index_elem
	-> Expr								{% id %}
	| Expr _ %to _ Expr					{% ([left,,,, right]) => ast.makeTo(left, right) %}
# Note that IBM defime this as (number | last | last - number)
# https://www.ibm.com/docs/en/i/7.4?topic=predicate-sql-json-path-expression

index_list
	-> index_elem						{% ([index_elem]) => [index_elem] %}
	| index_list _ "," _ index_elem		{% ([index_list,,,, index_elem]) => [...index_list, index_elem] %}

any_level
	-> %int								{% ([token]) => Number(token) %}
	| %last								{% () => -1 %}

AnyPath
	-> base _ "." _ %any				{% ([base]) => ast.makeAnyPath(base, 0, -1) %}
	| base _ "." _ %any _ "{" _ any_level _ "}"
										{% ([base, ,,,,,,, index]) => ast.makeAnyPath(base, index, index) %}
	| base _ "." _ %any _ "{" _ any_level _ %to _ any_level _ "}"
										{% ([base, ,,,,,,, start, ,,, end]) => ast.makeAnyPath(base, start, end) %}

key
	-> key_name:+						{% ([tokens]) => tokens.join("") %}
	| string							{% id %}

key_name
	-> %ident							{% id %}
	| %to								{% id %}
	| %null								{% id %}
	| %true								{% id %}
	| %false							{% id %}
	| %is								{% id %}
	| %unknown							{% id %}
	| %exists							{% id %}
	| %strict							{% id %}
	| %lax								{% id %}
	| %abs								{% id %}
	| %size								{% id %}
	| %type								{% id %}
	| %floor							{% id %}
	| %double							{% id %}
	| %ceiling							{% id %}
	| %datetime							{% id %}
	| %keyvalue							{% id %}
	| %last								{% id %}
	| %starts							{% id %}
	| %with								{% id %}
	| %like_regex						{% id %}
	| %flag								{% id %}

method
	-> %abs								{% () => "abs" %}
	| %size								{% () => "size" %}
	| %type								{% () => "type" %}
	| %floor							{% () => "floor" %}
	| %double							{% () => "double" %}
	| %ceiling							{% () => "ceiling" %}
	| %keyvalue							{% () => "keyvalue" %}

_ -> ignored:*							{% () => null %}

ignored
	-> %blank							{% () => null %}
	| %startxc %xcbody:* %endxc			{% () => null %}
