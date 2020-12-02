<div align="center">
  <h1>🥒 parcook</h1>
  <a href="https://bundlephobia.com/result?p=parcook">
    <img src="https://badgen.net/bundlephobia/minzip/parcook@0.1.3" alt="minified and gzipped size">
    <img src="https://badgen.net/bundlephobia/min/parcook@0.1.3" alt="minified size">
    <img src="https://badgen.net/bundlephobia/dependency-count/parcook@0.1.3" alt="zero dependencies">
  </a>
</div>

Parse strings using generator functions.

## Installations

```console
npm add parcook
```

## Examples

### IP Address parser

```typescript

```

### Basic CSS parser

```typescript
import { parse } from 'parcook';

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
  while ((yield may('}')) === false) {
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

- Emoticons to Emoji
- Basic CSS
- CSV
- JSON
- Cron
- Markdown subset
