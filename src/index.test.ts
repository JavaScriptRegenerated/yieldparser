import { parse, hasMore } from './index';

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

  describe('ES modules', () => {
    const code = `import first from 'first-module';

import second from 'second-module';

const a = 'hello!';
const pi = 3.14159;

export const b = 'some exported';
    `;

    it('can parse an ES module', () => {
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
          lines.push(yield [ConstStatement, ImportStatement, ExportStatement]);
          yield /^[\n\s]*/;
        }
        return lines;
      }

      expect(parse('', ESModuleParser())).toEqual({
        remaining: '',
        success: true,
        result: [],
      });

      expect(parse(code, ESModuleParser())).toEqual({
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
      });
    });
  });
});
