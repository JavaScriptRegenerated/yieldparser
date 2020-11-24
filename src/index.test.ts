import { parse } from './index';

describe('parse()', () => {
  describe('failing', () => {
    it('parses string', () => {
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

  describe('succeeding', () => {
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
            const found1 = yield /^abc/;
            expect(found1).toEqual('abc');
            
            const found2 = yield /^def/;
            expect(found2).toEqual('def');
            
            return { found1, found2 };
          })()
        )
      ).toEqual({
        remaining: '',
        success: true,
        result: {
          found1: 'abc',
          found2: 'def'
        }
      });
    });
  });
});
