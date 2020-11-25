import { parse } from './index';

describe('parse()', () => {
  describe('failing', () => {
    test('array of wrong substrings', () => {
      expect(parse('abcdef', ['abc', 'wrong'])).toEqual({
        remaining: 'def',
        success: false,
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
      ).toEqual({ success: false, remaining: 'abc' });
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
      ).toEqual({ success: false, remaining: 'DEF' });
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

    it('accepts regex', () => {
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
});
