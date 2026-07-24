# FORGE language reference

This document describes the behavior implemented by FORGE v14.1.0.

## Lexical rules

Source is UTF-16 text. Identifiers match `[A-Za-z_][A-Za-z0-9_]*` and are
case-sensitive. `//` starts a comment that continues to the end of the line.
Statements end with semicolons.

Reserved words are:

```text
let print if else while fn return break continue true false
```

Strings use double quotes and support `\n`, `\t`, `\r`, `\\`, `\"`, and `\0`.
Multiline string literals are accepted. Other escape sequences are errors.

## Grammar

The following EBNF is descriptive; `EOF` means the end of the source.

```ebnf
program        = { statement }, EOF ;

statement      = letStatement
               | printStatement
               | ifStatement
               | whileStatement
               | functionDecl
               | returnStatement
               | "break", ";"
               | "continue", ";"
               | block
               | expressionStatement ;

letStatement   = "let", IDENT, "=", expression, ";" ;
printStatement = "print", "(", [ arguments ], ")", ";" ;
ifStatement    = "if", "(", expression, ")", block,
                 [ "else", ( ifStatement | block ) ] ;
whileStatement = "while", "(", expression, ")", block ;
functionDecl   = "fn", IDENT, "(", [ parameters ], ")", block ;
returnStatement = "return", [ expression ], ";" ;
block          = "{", { statement }, "}" ;

expressionStatement = expression,
                      [ ( "=" | "+=" | "-=" | "*=" | "/=" | "%=" ),
                        expression ],
                      ";" ;

expression     = logicalOr ;
logicalOr      = logicalAnd, { "||", logicalAnd } ;
logicalAnd     = equality, { "&&", equality } ;
equality       = comparison, { ( "==" | "!=" ), comparison } ;
comparison     = addition, { ( "<" | ">" | "<=" | ">=" ), addition } ;
addition       = multiplication, { ( "+" | "-" ), multiplication } ;
multiplication = unary, { ( "*" | "/" | "%" ), unary } ;
unary          = ( "-" | "!" ), unary | postfix ;
callTarget     = IDENT | "(", callTarget, ")" ;
postfix        = ( callTarget, "(", [ arguments ], ")" | primary ),
                 { "[", expression, "]" } ;
primary        = NUMBER | STRING | "true" | "false"
               | array | IDENT | "(", expression, ")" ;
array          = "[", [ arguments ], "]" ;
arguments      = expression, { ",", expression } ;
parameters     = IDENT, { ",", IDENT } ;
```

Only identifiers name callable functions; the identifier may be redundantly
parenthesized, so `(f)(3)` is equivalent to `f(3)`. Functions and indexed
values are not first-class callable values: the result of a call or an index
expression is not itself callable.

## Values

FORGE has three runtime value categories:

| Value  | Semantics                             |
| ------ | ------------------------------------- |
| Number | Finite IEEE-754 double                |
| String | Immutable UTF-16 string               |
| Array  | Mutable, reference-semantics sequence |

`true` and `false` compile to the numeric values `1` and `0`. Comparisons and
logical operators also produce `1` or `0`; consequently `type_of(true)` is
`"number"`.

Arrays compare by identity. Two separately created arrays are unequal even when
their contents match. Assigning an array to another variable shares the same
array.

String length and indexing use UTF-16 code units. For example, `len("😀")` is
`2`. This policy is explicit so indexing, `char_at`, and `substr` remain
deterministic.

## Variables and scope

`let` creates a binding in the current block. Function names and variable names
live in separate namespaces: a variable name cannot be declared twice with
`let` in the same block, and a function name cannot be declared twice with `fn`
in the same block, but a variable and a function may share a name. A call
`f(...)` resolves to the function, while reading or assigning `f` resolves to
the variable. A nested block may shadow either kind of name. Assignments
require an existing binding. A variable becomes available after its
declaration and initializer. Direct forward reads and direct self-referencing
initializers are semantic errors, including in unreachable code. FORGE does
not perform interprocedural definite-initialization analysis: if an
initializer invokes a function that reads the binding currently being
initialized, execution fails deterministically with an `execute` error.

Functions use lexical scope: a function resolves variables through the
environment where it was declared, not through its caller. Nested functions can
read and update variables in an active outer function. Functions do not escape
their declaring activation because functions are not values.

Function declarations are available throughout their block, enabling forward
references and mutual recursion. Parameters and calls have fixed arity.
Calling an unknown function or using the wrong argument count is a semantic
error, including inside code that would not execute.

## Control flow

`if` and `while` use FORGE truthiness. Numeric zero and the empty string are
false; non-zero numbers, non-empty strings, and arrays are true.

`break` and `continue` are valid only inside the nearest loop. `return` is valid
only inside a function. A function that reaches its closing brace without an
explicit return produces `0`.

`&&` and `||` short-circuit and normalize their result to `1` or `0`.

## Operators

From highest to lowest precedence:

1. indexing and calls;
2. unary `-` and `!`;
3. `*`, `/`, `%`;
4. `+`, `-`;
5. `<`, `>`, `<=`, `>=`;
6. `==`, `!=`;
7. `&&`;
8. `||`.

Arithmetic and ordered comparisons require finite numbers. Division or modulo
by zero and numeric overflow are runtime errors. `+` adds two numbers; if
either operand is a string it concatenates their printable forms. Equality is
strict and does not coerce between strings and numbers.

Both variables and array elements support `=`, `+=`, `-=`, `*=`, `/=`, and
`%=`. Compound index assignment evaluates its target and index once.

## Built-ins

| Function                       | Result                                                   |
| ------------------------------ | -------------------------------------------------------- |
| `len(value)`                   | String code-unit count or array length                   |
| `char_at(string, index)`       | One UTF-16 code unit                                     |
| `substr(string, start, count)` | A string slice; an oversized count clamps                |
| `floor(number)`                | The greatest integer not above the number                |
| `type_of(value)`               | `"number"`, `"string"`, or `"array"`                     |
| `push(array, value)`           | Mutates the array and returns its new length             |
| `pop(array)`                   | Removes and returns the last element; empty arrays error |

Indexes, substring bounds, and counts must be integers where applicable.
Strings are immutable and cannot be index-assigned.

## Output

`print` evaluates and formats its arguments from left to right without an
automatic separator, concatenates them, and then emits one output record. If a
function called while evaluating an argument prints its own record, that nested
record completes first; the outer record resumes afterward without sharing or
corrupting the nested record. Formatting an earlier mutable array therefore
captures its value before a later argument can mutate it. `print();` emits an
empty record. Strings print without quotes; strings inside arrays are quoted and
escaped. Cyclic arrays are represented safely.

## Compiler API

`compileSource(source)` returns tokens, AST, analysis summary, labelled
`assembly`, resolved `linkedCode`, instruction addresses, per-stage timings,
and the VM result. Pass `{ run: false }` to stop after linking; the execution
result is then `null`. Pass `{ includeLinkedCode: false }` when a transport does
not need the resolved instruction copy; linking still runs and remains timed.

The lower-level `execute(assembly, limits)` API accepts modern or compatibility
instruction field names, but validates instruction count, opcodes, operands,
targets, strings, and arrays before execution. Internal linked code uses the
canonical `opcode` and `argument` fields, contains no `LABEL` instructions, and
requires calls to target an actual instruction; jumps may target the program
end.

## Diagnostics

Failures identify their compiler phase:

- `compile`: invalid limit containers, names, or values;
- `lex`: invalid characters, strings, numbers, or input limits;
- `parse`: invalid grammar, nesting, or `return` outside a function;
- `analyze`: names, declarations, arity, and `break`/`continue` loop context;
- `codegen` / `link`: instruction and label integrity;
- `execute`: types, bounds, arithmetic, stacks, calls, and runtime limits.

Lexing, parsing, and semantic errors retain a line and column when available.

## Default limits

Limits can be overridden through `compileSource(source, { limits })`.

| Limit                           |   Default |
| ------------------------------- | --------: |
| Source characters               |   250,000 |
| Tokens                          |    75,000 |
| Parser nesting                  |       256 |
| Generated instructions          |   250,000 |
| VM steps                        | 1,000,000 |
| Call frames                     |    50,000 |
| Operand stack values            |   100,000 |
| Array elements                  |   100,000 |
| String characters               | 1,000,000 |
| Output lines                    |     5,000 |
| Output characters               | 1,000,000 |
| Trace entries                   |       500 |
| Values per trace stack snapshot |        64 |
| Trace characters                | 1,000,000 |
| Characters per traced string    |       512 |
| Formatting depth                |        32 |
| Formatted items                 |     1,000 |
| Formatted characters            |    20,000 |

Normal completion has status `halted`. Exhausting the step budget has status
`step_limit`. When the output quota permits, the output retains the historical
`[EXECUTION LIMIT REACHED]` marker for v13 compatibility; otherwise the normal
output truncation marker and flags replace it while the status remains
`step_limit`. Output and trace limits set explicit `outputTruncated` and
`traceOverflow` flags on the result. Formatted values and retained trace strings
are hard-capped.
`maxOutputCharacters` and `maxOutputLines` cap program-produced output and its
record separators. Fixed truncation markers may exceed those numeric budgets;
they are bounded diagnostic metadata signaled by the result status and flags.
