// https://www.w3.org/TR/mediaqueries-5/
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

type ParsedType<A> = A extends { Parser: () => Generator }
  ? ParsedTypeForClass<A>
  : A extends (...args: unknown[]) => unknown
  ? ParsedTypeForFunction<A>
  : never;
type ParsedTypeForFunction<F extends (...args: unknown[]) => unknown> =
  ReturnType<F> extends Generator<unknown, infer Y> ? Y : never;
type ParsedTypeForClass<C extends { Parser: () => Generator }> = ReturnType<
  C['Parser']
> extends Generator<unknown, infer Y>
  ? Y
  : never;

function* ParseInt() {
  const isNegative: boolean = yield has('-');
  const [stringValue]: [string] = yield /^\d+/;
  return parseInt(stringValue, 10) * (isNegative ? -1 : 1);
}

class ParsedMediaType {
  constructor(public readonly mediaType: 'screen' | 'print' | 'all') {}

  matches(context: { mediaType: 'screen' | 'print' }) {
    if (this.mediaType === "all") return true;
    return (this.mediaType === context.mediaType);
  }

  static *Parser() {
    yield optionalWhitespace;
    const mediaType: ParsedMediaType['mediaType'] = yield ['screen', 'print'];
    return new ParsedMediaType(mediaType);
  }
}

function* ParseMinWidth() {
  yield optionalWhitespace;
  yield '(';
  yield 'min-width:';
  yield optionalWhitespace;
  const value: ParsedType<typeof ParseInt> = yield ParseInt;
  const unit = yield ['px', 'em', 'rem'];
  yield optionalWhitespace;
  yield ')';
  return { minWidth: value };
}

function* ParseMediaQuery() {
  type Result =
    | ParsedMediaType
    | ParsedType<typeof ParseMinWidth>;

  const result: Result = yield [ParsedMediaType.Parser, ParseMinWidth];
  yield mustEnd;
  return result;
}

interface MatchMediaContext {
  mediaType: 'screen' | 'print';
  viewportWidth: number;
}
function matchMedia(context: MatchMediaContext, mediaQuery: string) {
  let matches = false;

  const parsed: ParseResult<ParsedType<typeof ParseMediaQuery>> = parse(
    mediaQuery,
    ParseMediaQuery() as any
  );
  if (!parsed.success) {
    throw Error(`Invalid media query: ${mediaQuery}`);
  }

  if (parsed.result instanceof ParsedMediaType) {
    matches = matches || parsed.result.matches(context);
  }
  if ('minWidth' in parsed.result) {
    matches = matches || parsed.result.minWidth <= context.viewportWidth;
  }

  return {
    matches,
  };
}

test('min-width: 480px', () => {
  const result = parse('(min-width: 480px)', ParseMediaQuery() as any);
  expect(result).toEqual({
    success: true,
    result: { minWidth: 480 },
    remaining: '',
  });

  const screen = { mediaType: 'screen' } as const;
  const print = { mediaType: 'print' } as const;

  expect(matchMedia({ ...screen, viewportWidth: 100 }, 'screen').matches).toBe(
    true
  );
  expect(matchMedia({ ...screen, viewportWidth: 100 }, 'print').matches).toBe(
    false
  );

  expect(matchMedia({ ...print, viewportWidth: 100 }, 'screen').matches).toBe(
    false
  );
  expect(matchMedia({ ...print, viewportWidth: 100 }, 'print').matches).toBe(
    true
  );

  expect(
    matchMedia({ ...screen, viewportWidth: 478 }, '(min-width: 480px)').matches
  ).toBe(false);
  expect(
    matchMedia({ ...screen, viewportWidth: 479 }, '(min-width: 480px)').matches
  ).toBe(false);
  expect(
    matchMedia({ ...screen, viewportWidth: 480 }, '(min-width: 480px)').matches
  ).toBe(true);
  expect(
    matchMedia({ ...screen, viewportWidth: 481 }, '(min-width: 480px)').matches
  ).toBe(true);
});
