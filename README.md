<div align="center">
  <h1>👑 🌿 yieldparser</h1>
  <p>Parse using composable generator functions. It’s like components for parsing.</p>
  <a href="https://bundlephobia.com/result?p=yieldparser">
    <img src="https://badgen.net/bundlephobia/minzip/yieldparser@0.3.0" alt="minified and gzipped size">
    <img src="https://badgen.net/bundlephobia/min/yieldparser@0.3.0" alt="minified size">
    <img src="https://badgen.net/bundlephobia/dependency-count/yieldparser@0.3.0" alt="zero dependencies">
  </a>
</div>

## Installation

```console
npm add yieldparser
```

## Overview

Yieldparser parses a source chunk-by-chunk. You define a generator function that yields each chunk to be found. This chunk can be a `string`, a `RexExp`, or another generator function. Your generator function receives replies from parsing that chunk, for example a regular expression would receive a reply with the matches that were found. You then use this information to build a result: the value that your generator function returns. This could be a simple value, or it could be an entire AST (abstract syntax tree).

If you yield an array of choices, then each choice is tested and the first one that matches is used.

If your chunks don’t match the input string, then an error result is returned with the remaining string and the chunk that it failed on. If it succeeds, then a success result is returned with the return value of the generator function, and the remaining string (if there is anything remaining).

Run `parse(input, yourGeneratorIterable)` to take an input string and parse into a result.

Run `invert(output, yourGeneratorIterable)` to take an expected result and map it back to a source string.

## Examples

- [Routes](#routes-parser)
- [IP Address](#ip-address-parser)
- [Maths expressions: `5 * 6 + 3`](src/math.test.ts)
- [Basic CSS](#basic-css-parser)
- Semver parser
- Emoticons to Emoji
- CSV
- JSON
- Cron
- Markdown subset

### Routes parser

Define a generator function for each route you have, and then define a top level `Routes` generator function. Then parse your path using `parse()`.

You can also map from a route object back to a path string using `invert()`.

```typescript
import { parse, mustEnd, invert } from "yieldparser";

type Route =
  | { type: "home" }
  | { type: "about" }
  | { type: "terms" }
  | { type: "blog" }
  | { type: "blogArticle"; slug: string };

function* Home() {
  yield "/";
  yield mustEnd;
  return { type: "home" } as Route;
}

function* About() {
  yield "/about";
  yield mustEnd;
  return { type: "about" } as Route;
}

function* Terms() {
  yield "/legal";
  yield "/terms";
  yield mustEnd;
  return { type: "terms" } as Route;
}

function* blogPrefix() {
  yield "/blog";
}

function* BlogHome() {
  yield blogPrefix;
  yield mustEnd;
  return { type: "blog" };
}

function* BlogArticle() {
  yield blogPrefix;
  yield "/";
  const [slug]: [string] = yield /^.+/;
  return { type: "blogArticle", slug };
}

function* BlogRoutes() {
  return yield [BlogHome, BlogArticle];
}

function* Routes() {
  return yield [Home, About, Terms, BlogRoutes];
}

parse("/", Routes()) // result: { type: "home" }, success: true, remaining: "" }
parse("/about", Routes()) // result: { type: "about" }, success: true, remaining: "" }
parse("/legal/terms", Routes()) // result: { type: "terms" }, success: true, remaining: "" }
parse("/blog", Routes()) // result: { type: "blog" }, success: true, remaining: "" }
parse("/blog/happy-new-year", Routes()) // result: { type: "blogArticle", slug: "happy-new-year" }, success: true, remaining: "" }

invert({ type: "home" }, Routes()) // "/"
invert({ type: "about" }, Routes()) // "/about"
invert({ type: "terms" }, Routes()) // "/legal/terms"
invert({ type: "blog" }, Routes()) // "/blog"
invert({ type: "blogArticle", slug: "happy-new-year" }, Routes()) // "/blog/happy-new-year"
```

### IP Address parser

```typescript
import { parse, mustEnd } from 'yieldparser';

function* Digit() {
  const [digit]: [string] = yield /^\d+/;
  const value = parseInt(digit, 10);
  if (value < 0 || value > 255) {
    return new Error(`Digit must be between 0 and 255, was ${value}`);
  }
  return value;
}

function* IPAddress() {
  const first = yield Digit;
  yield '.';
  const second = yield Digit;
  yield '.';
  const third = yield Digit;
  yield '.';
  const fourth = yield Digit;
  yield mustEnd;
  return [first, second, third, fourth];
}

parse('1.2.3.4', IPAddress());
/*
{
  success: true,
  result: [1, 2, 3, 4],
  remaining: '',
}
*/

parse('1.2.3.256', IPAddress());
/*
{
  success: false,
  failedOn: {
    nested: [
      {
        yielded: new Error('Digit must be between 0 and 255, was 256'),
      },
    ],
  },
  remaining: '256',
}
*/
```

### Basic CSS parser

```typescript
import { parse, hasMore, has } from 'yieldparser';

type Selector = string;
interface Declaraction {
  property: string;
  value: string;
}
interface Rule {
  selectors: Array<Selector>;
  declarations: Array<Declaraction>;
}

const whitespaceMay = /^\s*/;

function* PropertyParser() {
  const [name]: [string] = yield /[-a-z]+/;
  return name;
}

function* ValueParser() {
  const [rawValue]: [string] = yield /(-?\d+(rem|em|%|px|)|[-a-z]+)/;
  return rawValue;
}

function* DeclarationParser() {
  const name = yield PropertyParser;
  yield whitespaceMay;
  yield ':';
  yield whitespaceMay;
  const rawValue = yield ValueParser;
  yield whitespaceMay;
  yield ';';
  return { name, rawValue };
}

function* RuleParser() {
  const declarations: Array<Declaraction> = [];

  const [selector]: [string] = yield /(:root|[*]|[a-z][\w]*)/;

  yield whitespaceMay;
  yield '{';
  yield whitespaceMay;
  while ((yield has('}')) === false) {
    yield whitespaceMay;
    declarations.push(yield DeclarationParser);
    yield whitespaceMay;
  }

  return { selector, declarations };
}

function* RulesParser() {
  const rules = [];

  yield whitespaceMay;
  while (yield hasMore) {
    rules.push(yield RuleParser);
    yield whitespaceMay;
  }
  return rules;
}

const code = `
:root {
  --first-var: 42rem;
  --second-var: 15%;
}

* {
  font: inherit;
  box-sizing: border-box;
}

h1 {
  margin-bottom: 1em;
}
`;

parse(code, RulesParser());

/*
{
  success: true,
  result: [
    {
      selector: ':root',
      declarations: [
        {
          name: '--first-var',
          rawValue: '42rem',
        },
        {
          name: '--second-var',
          rawValue: '15%',
        },
      ],
    },
    {
      selector: '*',
      declarations: [
        {
          name: 'font',
          rawValue: 'inherit',
        },
        {
          name: 'box-sizing',
          rawValue: 'border-box',
        },
      ],
    },
    {
      selector: 'h1',
      declarations: [
        {
          name: 'margin-bottom',
          rawValue: '1em',
        },
      ],
    },
  ],
  remaining: '',
}
*/
```
