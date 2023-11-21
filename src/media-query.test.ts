import {
  has,
  mustEnd,
  optional,
  parse,
  ParseGenerator,
  ParseResult,
  ParseYieldable,
} from './index';

const optionalWhitespace = /^\s*/;
const requiredWhitespace = /^\s+/;

type ParsedType<F extends (...args: unknown[]) => unknown> =
  ReturnType<F> extends Generator<unknown, infer Y> ? Y : never;

function* ParseInt() {
  const isNegative: boolean = yield has('-');
  const [stringValue]: [string] = yield /^\d+/;
  return parseInt(stringValue, 10) * (isNegative ? -1 : 1);
}

function* ParseMinWidth() {
  const [stringValue]: [string] = yield 'min-width:';
  yield optionalWhitespace;
  const value: ParsedType<typeof ParseInt> = yield ParseInt;
  const unit = yield ['px', 'em', 'rem'];
  return { minWidth: value };
}

function* ParseMediaQuery() {
  type Result = ParsedType<typeof ParseMinWidth>

  const result: Result = yield [ParseMinWidth];
  yield mustEnd;
  return result;
}

interface MatchMediaContext {
  viewportWidth: number;
}
function matchMedia(context: MatchMediaContext, mediaQuery: string) {
  let matches = false;

  const parsed: ParseResult<ParsedType<typeof ParseMediaQuery>> = parse('min-width: 480px', ParseMediaQuery() as any);
  if (!parsed.success) {
    throw Error(`Invalid media query: ${mediaQuery}`);
  }

  if ('minWidth' in parsed.result) {
    matches = matches || parsed.result.minWidth <= context.viewportWidth
  }

  return {
    matches,
  };
}

test('min-width: 480px', () => {
  const result = parse('min-width: 480px', ParseMediaQuery() as any);
  expect(result).toEqual({
    success: true,
    result: { minWidth: 480 },
    remaining: '',
  });

  expect(matchMedia({ viewportWidth: 478 }, "min-width: 480px").matches).toBe(false)
  expect(matchMedia({ viewportWidth: 479 }, "min-width: 480px").matches).toBe(false)
  expect(matchMedia({ viewportWidth: 480 }, "min-width: 480px").matches).toBe(true)
  expect(matchMedia({ viewportWidth: 481 }, "min-width: 480px").matches).toBe(true)
});
