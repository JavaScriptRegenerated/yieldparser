import { parse, hasMore, has, optional } from './index';

describe('ES modules', () => {
    const code = `import first from 'first-module';

import second from 'second-module';

const a = 'hello!';
const pi = 3.14159;

function whoami() {
  return 'admin';
}

function* oneTwoThree() {
  yield 1;
  yield 2;
  yield 3;
}

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

    function* ReturnStatement() {
      yield 'return';
      yield whitespaceMust;
      const value = yield Expression;
      yield semicolonOptional;
      return { type: 'return', value };
    }

    function* YieldStatement() {
      yield 'yield';
      yield whitespaceMust;
      const value = yield Expression;
      yield semicolonOptional;
      return { type: 'yield', value };
    }

    function* FunctionParser() {
      yield 'function';
      yield whitespaceMay;
      const isGenerator: boolean = yield has('*');
      yield whitespaceMay;
      const { name }: { name: string } = yield Identifier;
      yield whitespaceMay;
      yield '(';
      yield ')';
      yield whitespaceMay;
      yield '{';
      yield whitespaceMay;
      let statements = [];
      while ((yield has('}')) === false) {
        yield whitespaceMay;
        const statement = yield [ConstStatement, ReturnStatement, YieldStatement];
        statements.push(statement);
        yield whitespaceMay;
      }
      // yield '}';
      return { type: 'function', name, isGenerator, statements };
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
        lines.push(yield [ConstStatement, ImportStatement, ExportStatement, FunctionParser]);
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
            type: 'function',
            name: 'whoami',
            isGenerator: false,
            statements: [
              {
                type: 'return',
                value: 'admin'
              }
            ],
          },
          {
            type: 'function',
            name: 'oneTwoThree',
            isGenerator: true,
            statements: [
              {
                type: 'yield',
                value: 1
              },
              {
                type: 'yield',
                value: 2
              },
              {
                type: 'yield',
                value: 3
              }
            ],
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