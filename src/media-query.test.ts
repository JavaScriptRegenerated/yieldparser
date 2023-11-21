// https://www.w3.org/TR/mediaqueries-5/
import {
  has,
  hasMore,
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

interface MatchMediaContext {
  mediaType: 'screen' | 'print';
  viewportWidth: number;
  viewportHeight: number;
}

class ParsedMediaType {
  constructor(public readonly mediaType: 'screen' | 'print' | 'all') {}

  matches(context: { mediaType: 'screen' | 'print' }) {
    if (this.mediaType === 'all') return true;
    return this.mediaType === context.mediaType;
  }

  static *Parser() {
    yield optionalWhitespace;
    yield optional(() => ['only', requiredWhitespace]);
    const mediaType: ParsedMediaType['mediaType'] = yield ['screen', 'print'];
    return new ParsedMediaType(mediaType);
  }
}

class ParsedNotMediaType {
  constructor(public readonly mediaType: 'screen' | 'print' | 'all') {}

  matches(context: { mediaType: 'screen' | 'print' }) {
    if (this.mediaType === 'all') return false;
    return this.mediaType !== context.mediaType;
  }

  static *Parser() {
    yield optionalWhitespace;
    yield 'not';
    yield requiredWhitespace;
    const mediaType: ParsedNotMediaType['mediaType'] = yield [
      'screen',
      'print',
    ];
    return new ParsedNotMediaType(mediaType);
  }
}

class ParsedMinWidth {
  constructor(
    public readonly value: number,
    public readonly unit: 'px' | 'em' | 'rem'
  ) {}

  matches(context: { viewportWidth: number }) {
    if (this.unit !== 'px') throw Error('Only supports px for now.');

    return this.value <= context.viewportWidth;
  }

  static *Parser() {
    yield optionalWhitespace;
    yield '(';
    yield 'min-width:';
    yield optionalWhitespace;
    const value: ParsedType<typeof ParseInt> = yield ParseInt;
    const unit = yield ['px', 'em', 'rem'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedMinWidth(value, unit);
  }
}

/**
 https://www.w3.org/TR/mediaqueries-5/#orientation
 */
class ParsedOrientation {
  constructor(public readonly orientation: 'portrait' | 'landscape') {}

  matches(context: { viewportWidth: number; viewportHeight: number }) {
    const calculated =
      context.viewportHeight >= context.viewportWidth
        ? 'portrait'
        : 'landscape';
    return this.orientation === calculated;
  }

  static *Parser() {
    yield optionalWhitespace;
    yield '(';
    yield 'orientation:';
    yield optionalWhitespace;
    const orientation: 'portrait' | 'landscape' = yield [
      'portrait',
      'landscape',
    ];
    yield optionalWhitespace;
    yield ')';
    return new ParsedOrientation(orientation);
  }
}

// See https://www.w3.org/TR/mediaqueries-5/#mq-syntax
const parsedMediaFeature = [ParsedMinWidth.Parser, ParsedOrientation.Parser];
const parsedMediaInParens = [...parsedMediaFeature];
type ParsedMediaFeature = ParsedType<typeof parsedMediaFeature[-1]>;
type ParsedMediaInParens = ParsedMediaFeature;

class ParsedMediaCondition {
  constructor(
    public readonly first: ParsedMediaFeature,
    public readonly conditions?: ParsedMediaAnds
  ) {}

  matches(context: MatchMediaContext) {
    const base = this.first.matches(context);
    if (this.conditions) {
      return base && this.conditions.matches(context);
    } else {
      return base;
    }
  }

  static *Parser() {
    yield optionalWhitespace;
    const first: ParsedMediaInParens = yield parsedMediaInParens;
    // const conditions: ParsedMediaAnds | undefined = yield optional(ParsedMediaAnds.Parser);
    const conditions: ParsedMediaAnds | '' = yield [ParsedMediaAnds.Parser, ''];
    if (conditions === '') {
      return first;
    } else {
      return new ParsedMediaCondition(first, conditions);
    }
  }
}

class ParsedMediaAnds {
  constructor(public readonly list: ReadonlyArray<ParsedMediaInParens>) {}

  matches(context: MatchMediaContext) {
    return this.list.every((m) => m.matches(context));
  }

  static *Parser() {
    const list: Array<ParsedMediaInParens> = [];

    do {
      console.log('and requiredWhitespace 1');
      yield requiredWhitespace;
      console.log('and requiredWhitespace 2');
      yield 'and';
      yield requiredWhitespace;
      list.push(yield parsedMediaInParens);
    } while (yield hasMore);

    return new ParsedMediaAnds(list);
  }
}

class ParsedMediaTypeThenConditionWithoutOr {
  constructor(
    public readonly mediaType: ParsedMediaType | ParsedNotMediaType,
    public readonly and: ReadonlyArray<ParsedMediaInParens>
  ) {}

  matches(context: MatchMediaContext) {
    return (
      this.mediaType.matches(context) &&
      this.and.every((m) => m.matches(context))
    );
  }

  static *Parser() {
    const mediaType: ParsedMediaType | ParsedNotMediaType = yield [
      ParsedMediaType.Parser,
      ParsedNotMediaType.Parser,
    ];

    const list: Array<ParsedMediaInParens> = [];

    while (yield has(/^\s+and\s/)) {
      list.push(yield parsedMediaInParens);
    }

    if (list.length === 0) {
      return mediaType;
    } else {
      return new ParsedMediaTypeThenConditionWithoutOr(mediaType, list);
    }
  }
}

class ParsedMediaQuery {
  constructor(
    public readonly main:
      | ParsedMediaTypeThenConditionWithoutOr
      | ParsedMediaType
  ) {}

  static *Parser() {
    const main: ParsedMediaQuery['main'] = yield [
      ParsedMediaTypeThenConditionWithoutOr.Parser,
      ParsedMediaCondition.Parser,
    ];
    yield optionalWhitespace;
    yield mustEnd;
    return main;
  }
}

function matchMedia(context: MatchMediaContext, mediaQuery: string) {
  const parsed: ParseResult<ParsedMediaQuery> = parse(
    mediaQuery,
    ParsedMediaQuery.Parser() as any
  );
  if (!parsed.success) {
    throw Error(`Invalid media query: ${mediaQuery}`);
  }

  let matches = false;
  if (
    'matches' in parsed.result &&
    typeof parsed.result.matches === 'function'
  ) {
    matches = parsed.result.matches(context);
  }

  return {
    matches,
  };
}

test('screen', () => {
  const result = parse('screen', ParsedMediaQuery.Parser() as any);
  expect(result).toEqual({
    success: true,
    result: new ParsedMediaType('screen'),
    remaining: '',
  });
});

test('(min-width: 480px)', () => {
  const result = parse('(min-width: 480px)', ParsedMediaQuery.Parser() as any);
  expect(result).toEqual({
    success: true,
    result: new ParsedMinWidth(480, 'px'),
    remaining: '',
  });
});

test('(orientation: landscape)', () => {
  const result = parse(
    '(orientation: landscape)',
    ParsedMediaQuery.Parser() as any
  );
  expect(result).toEqual({
    success: true,
    result: new ParsedOrientation('landscape'),
    remaining: '',
  });
});

test('screen and (min-width: 480px)', () => {
  const result = parse(
    'screen and (min-width: 480px)',
    ParsedMediaQuery.Parser() as any
  );
  expect(result).toEqual({
    success: true,
    result: new ParsedMediaTypeThenConditionWithoutOr(
      new ParsedMediaType('screen'),
      [new ParsedMinWidth(480, 'px')]
    ),
    remaining: '',
  });
});

test('matchMedia()', () => {
  const screenSized = (viewportWidth: number, viewportHeight: number) =>
    ({ mediaType: 'screen', viewportWidth, viewportHeight } as const);
  const printSized = (viewportWidth: number, viewportHeight: number) =>
    ({ mediaType: 'print', viewportWidth, viewportHeight } as const);

  expect(matchMedia(screenSized(100, 100), 'screen').matches).toBe(true);
  expect(matchMedia(screenSized(100, 100), 'only screen').matches).toBe(true);
  expect(matchMedia(screenSized(100, 100), 'not screen').matches).toBe(false);
  expect(matchMedia(screenSized(100, 100), 'print').matches).toBe(false);
  expect(matchMedia(screenSized(100, 100), 'only print').matches).toBe(false);

  expect(matchMedia(printSized(100, 100), 'screen').matches).toBe(false);
  expect(matchMedia(printSized(100, 100), 'only screen').matches).toBe(false);
  expect(matchMedia(printSized(100, 100), 'print').matches).toBe(true);
  expect(matchMedia(printSized(100, 100), 'only print').matches).toBe(true);

  expect(matchMedia(screenSized(478, 100), '(min-width: 480px)').matches).toBe(
    false
  );
  expect(matchMedia(screenSized(479, 100), '(min-width: 480px)').matches).toBe(
    false
  );
  expect(matchMedia(screenSized(480, 100), '(min-width: 480px)').matches).toBe(
    true
  );
  expect(matchMedia(screenSized(481, 100), '(min-width: 480px)').matches).toBe(
    true
  );

  expect(
    matchMedia(screenSized(200, 100), '(orientation: landscape)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(200, 100), '(orientation: portrait)').matches
  ).toBe(false);

  expect(
    matchMedia(screenSized(100, 200), '(orientation: landscape)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 200), '(orientation: portrait)').matches
  ).toBe(true);

  expect(
    matchMedia(screenSized(100, 100), '(orientation: landscape)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100), '(orientation: portrait)').matches
  ).toBe(true);

  expect(
    matchMedia(screenSized(481, 100), 'screen and (min-width: 480px)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(481, 100), 'only screen and (min-width: 480px)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(481, 100), 'only screen and (min-width: 480px) and (orientation: landscape)')
      .matches
  ).toBe(true);
});
