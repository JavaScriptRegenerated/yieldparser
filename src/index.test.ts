import { parse, hasMore, mustEnd, has } from './index';

describe('parse()', () => {
  describe('failing', () => {
    test('array of wrong substrings', () => {
      expect(parse('abcdef', ['abc', 'wrong'])).toEqual({
        remaining: 'def',
        success: false,
        failedOn: { iterationCount: 1, yielded: 'wrong' },
      });
    });

    test('yielding string after start', () => {
      expect(
        parse(
          'abc',
          (function* () {
            yield 'bc';
          })()
        )
      ).toEqual({
        success: false,
        remaining: 'abc',
        failedOn: { iterationCount: 0, yielded: 'bc' },
      });
    });

    test('yielding wrong string', () => {
      expect(
        parse(
          'abcDEF',
          (function* () {
            yield 'abc';
            yield 'def';
          })()
        )
      ).toEqual({
        success: false,
        remaining: 'DEF',
        failedOn: { iterationCount: 1, yielded: 'def' },
      });
    });
  });

  describe('succeeding iterables', () => {
    it('accepts substrings', () => {
      expect(parse('abcdef', ['abc', 'def'])).toEqual({
        remaining: '',
        success: true,
      });
    });

    it('accepts array of substrings', () => {
      expect(parse('abcdef', [['123', 'abc'], 'def'])).toEqual({
        remaining: '',
        success: true,
      });
    });
  });

  describe('succeeding generator functions', () => {
    it('accepts substrings', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            yield 'abc';
            yield 'def';
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
      });
    });

    it('accepts empty string', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            yield '';
            yield 'abc';
            yield '';
            yield 'def';
            yield '';
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
      });
    });

    it('accepts array of substrings', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            const found: string = yield ['abc', '123'];
            yield 'def';
            return { found };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          found: 'abc',
        },
      });
    });

    it('accepts array of substrings', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            const found: string = yield ['123', 'abc'];
            yield 'def';
            return { found };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          found: 'abc',
        },
      });
    });

    it('accepts Set of substrings', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            const found: string = yield new Set(['123', 'abc']);
            yield 'def';
            return { found };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          found: 'abc',
        },
      });
    });
    it('accepts Set of substrings', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            const found: string = yield 'abc';
            yield 'def';
            return { found };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          found: 'abc',
        },
      });
    });

    it('accepts regex', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            yield /^abc/;
            yield /^def$/;
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
      });
    });

    it('accepts newlines as string and regex', () => {
      expect(
        parse(
          '\n\n',
          (function* () {
            yield '\n';
            yield /^\n/;
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
      });
    });

    it('yields result from regex', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            const [found1]: [string] = yield /^abc/;
            const [found2]: [string] = yield /^def/;
            return { found1, found2 };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          found1: 'abc',
          found2: 'def',
        },
      });
    });

    it('accepts regex with capture groups', () => {
      expect(
        parse(
          'abcdef',
          (function* () {
            const [whole, first, second]: [
              string,
              string,
              string
            ] = yield /^a(b)(c)/;
            const [found2]: [string] = yield /^def/;
            return { whole, first, second, found2 };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          whole: 'abc',
          first: 'b',
          second: 'c',
          found2: 'def',
        },
      });
    });

    it('accepts yield delegating to other generator function', () => {
      function* BCD() {
        yield 'b';
        yield 'c';
        yield 'd';
        return { bcd: true };
      }

      expect(
        parse(
          'abcdef',
          (function* () {
            yield 'a';
            const result = yield* BCD();
            yield 'ef';
            return result;
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          bcd: true,
        },
      });
    });

    it('accepts yielding array of other generator functions', () => {
      function* BCD() {
        yield 'b';
        yield 'c';
        yield 'd';
        return { bcd: true };
      }

      function* BAD() {
        yield 'b';
        yield 'a';
        yield 'd';
        return { bad: true };
      }

      expect(
        parse(
          'abcdef',
          (function* () {
            yield 'a';
            const result = yield [BAD, BCD];
            yield 'ef';
            return result;
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          bcd: true,
        },
      });
    });
  });

  describe('IP Address', () => {
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

    it('accepts valid IP addresses', () => {
      expect(parse('1.2.3.4', IPAddress())).toEqual({
        success: true,
        result: [1, 2, 3, 4],
        remaining: '',
      });

      expect(parse('255.255.255.255', IPAddress())).toEqual({
        success: true,
        result: [255, 255, 255, 255],
        remaining: '',
      });
    });

    it('rejects invalid IP addresses', () => {
      expect(parse('1.2.3.256', IPAddress())).toEqual({
        success: false,
        failedOn: expect.objectContaining({
          nested: [
            expect.objectContaining({
              yielded: new Error('Digit must be between 0 and 255, was 256'),
            }),
          ],
        }),
        remaining: '256',
      });

      expect(parse('1.2.3.4.5', IPAddress())).toEqual({
        success: false,
        failedOn: expect.objectContaining({
          yielded: mustEnd,
        }),
        remaining: '.5',
      });
    });
  });

  describe('Router', () => {
    type Route =
      | { type: 'home' }
      | { type: 'about' }
      | { type: 'albums' }
      | { type: 'album'; id: string }
      | { type: 'albumArt'; id: string };

    function* Home() {
      yield '/';
      yield mustEnd;
      return { type: 'home' } as Route;
    }

    function* About() {
      yield '/about';
      yield mustEnd;
      return { type: 'about' } as Route;
    }

    const Albums = {
      *List() {
        yield '/albums';
        yield mustEnd;
        return { type: 'albums' } as Route;
      },
      *ItemPrefix() {
        yield '/albums/';
        const [id]: [string] = yield /^\d+/;
        return { id };
      },
      *Item() {
        const { id }: { id: string } = yield Albums.ItemPrefix;
        yield mustEnd;
        return { type: 'album', id } as Route;
      },
      *ItemArt() {
        const { id }: { id: string } = yield Albums.ItemPrefix;
        yield '/art';
        yield mustEnd;
        return { type: 'albumArt', id } as Route;
      },
    };

    function* AlbumRoutes() {
      return yield [Albums.List, Albums.Item, Albums.ItemArt];
    }

    function* Route() {
      return yield [Home, About, AlbumRoutes];
    }

    it('works with home', () => {
      expect(parse('/', Route())).toEqual({
        success: true,
        result: { type: 'home' },
        remaining: '',
      });
    });
    it('works with about', () => {
      expect(parse('/about', Route())).toEqual({
        success: true,
        result: { type: 'about' },
        remaining: '',
      });
    });
    it('works with albums', () => {
      expect(parse('/albums', Route())).toEqual({
        success: true,
        result: { type: 'albums' },
        remaining: '',
      });
    });
    it('works with album for id', () => {
      expect(parse('/albums/42', Route())).toEqual({
        success: true,
        result: { type: 'album', id: '42' },
        remaining: '',
      });
    });
    it('works with album art for id', () => {
      expect(parse('/albums/42/art', Route())).toEqual({
        success: true,
        result: { type: 'albumArt', id: '42' },
        remaining: '',
      });
    });
  });

  describe('ES modules', () => {
    const code = `import first from 'first-module';

import second from 'second-module';

const a = 'hello!';
const pi = 3.14159;

;; ;; ;;

export const b = 'some exported';
    `;

    const whitespaceMust = /^\s+/;
    const whitespaceMay = /^\s*/;
    const semicolonOptional = /^;*/;
    // See: https://stackoverflow.com/questions/2008279/validate-a-javascript-function-name
    const identifierRegex = /^[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*/;
    const stringRegex = /^('(?<contentsSingle>([^']|\\['\\bfnrt\/])*)'|"(?<contentsDouble>([^"]|\\['\\bfnrt\/])*)")/;

    function* Identifier() {
      const [name]: [string] = yield identifierRegex;
      return { name };
    }

    function* StringLiteral() {
      const {
        groups,
      }: {
        groups: Record<'contentsSingle' | 'contentsDouble', string>;
      } = yield stringRegex;
      return groups.contentsSingle || groups.contentsDouble || '';
    }

    function* NumberLiteral() {
      const [stringValue]: [
        string
      ] = yield /^(([\d]+[.][\d]*)|([\d]*[.][\d]+)|([\d]+))/;
      return parseFloat(stringValue);
    }

    function* ValueLiteral() {
      return yield [StringLiteral, NumberLiteral];
    }

    function* Expression() {
      return yield [ValueLiteral];
    }

    function* ConstStatement() {
      yield 'const';
      yield whitespaceMust;
      const { name }: { name: string } = yield Identifier;
      yield whitespaceMay;
      yield '=';
      yield whitespaceMay;
      const value = yield Expression;
      yield semicolonOptional;
      return { type: 'const', name, value };
    }

    function* ImportStatement() {
      yield 'import';
      yield whitespaceMust;
      const { name: defaultBinding }: { name: string } = yield Identifier;
      yield whitespaceMust;
      yield 'from';
      yield whitespaceMay;
      const moduleSpecifier = yield StringLiteral;
      yield semicolonOptional;
      return {
        type: 'import',
        defaultBinding,
        moduleSpecifier,
      };
    }

    function* ExportStatement() {
      yield 'export';
      yield whitespaceMust;
      const exported = yield ConstStatement;
      return { type: 'export', exported };
    }

    // function* ExportNamed() {
    //   yield 'export';
    //   return { bad: true };
    // }

    function* ESModuleParser() {
      const lines = [];
      while (yield hasMore) {
        yield /^[\s;]*/;
        lines.push(yield [ConstStatement, ImportStatement, ExportStatement]);
        yield /^[\s;]*/;
      }
      return lines;
    }

    it('accepts empty string', () => {
      expect(parse('', ESModuleParser())).toEqual({
        remaining: '',
        success: true,
        result: [],
      });
    });

    describe('valid ES module', () => {
      const expected = {
        remaining: '',
        success: true,
        result: [
          {
            type: 'import',
            defaultBinding: 'first',
            moduleSpecifier: 'first-module',
          },
          {
            type: 'import',
            defaultBinding: 'second',
            moduleSpecifier: 'second-module',
          },
          {
            type: 'const',
            name: 'a',
            value: 'hello!',
          },
          {
            type: 'const',
            name: 'pi',
            value: 3.14159,
          },
          {
            type: 'export',
            exported: {
              type: 'const',
              name: 'b',
              value: 'some exported',
            },
          },
        ],
      };

      it('can parse an ES module', () => {
        expect(parse(code, ESModuleParser())).toEqual(expected);
      });

      it('can parse with leading and trailing whitespace', () => {
        expect(parse('\n \n ' + code + ' \n \n', ESModuleParser())).toEqual(
          expected
        );
      });
    });
  });

  describe('CSS', () => {
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
      const [name]: [string] = yield /^[-a-z]+/;
      return name;
    }

    function* ValueParser() {
      const [rawValue]: [string] = yield /^(-?\d+(rem|em|%|px|)|[-a-z]+)/;
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

      const [selector]: [string] = yield /^(:root|[*]|[a-z][\w]*)/;

      yield whitespaceMay;
      yield '{';
      yield whitespaceMay;
      while ((yield has('}')) === false) {
        yield whitespaceMay;
        declarations.push(yield DeclarationParser);
        yield whitespaceMay;
      }

      return { selectors: [selector], declarations } as Rule;
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

    it('parses', () => {
      expect(parse(code, RulesParser())).toEqual({
        success: true,
        result: [
          {
            selectors: [':root'],
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
            selectors: ['*'],
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
            selectors: ['h1'],
            declarations: [
              {
                name: 'margin-bottom',
                rawValue: '1em',
              },
            ],
          },
        ],
        remaining: '',
      });
    });
  });
});
