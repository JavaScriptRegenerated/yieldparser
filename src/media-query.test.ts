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
  viewportZoom: number;
  rootFontSizePx: number;
  primaryPointingDevice?: 'touchscreen' | 'mouse';
  secondaryPointingDevice?: 'touchscreen' | 'mouse';
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

/**
 * https://www.w3.org/TR/mediaqueries-5/#width
 */
class ParsedMinWidth {
  constructor(
    public readonly value: number,
    public readonly unit: 'px' | 'em' | 'rem'
  ) {}

  private valueInPx(context: MatchMediaContext): number {
    switch (this.unit) {
      case 'px':
        return this.value;
      case 'rem':
      case 'em':
        return this.value * context.rootFontSizePx;
    }
  }

  matches(context: MatchMediaContext) {
    return this.valueInPx(context) <= context.viewportWidth;
  }

  static *Parser() {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    yield 'min-width:';
    yield optionalWhitespace;
    const value: number = yield ParseInt;
    const unit = yield ['px', 'em', 'rem'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedMinWidth(value, unit);
  }
}

/**
 * https://www.w3.org/TR/mediaqueries-5/#orientation
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
    yield optionalWhitespace;
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

/**
 https://www.w3.org/TR/mediaqueries-5/#hover
 */
const PointerAccuracy = Object.freeze({
  none: 0,
  coarse: 1,
  fine: 2,

  fromDevice(device: 'touchscreen' | 'mouse' | undefined) {
    switch (device) {
      case 'mouse':
        return PointerAccuracy.fine;
      case 'touchscreen':
        return PointerAccuracy.coarse;
      default:
        return PointerAccuracy.none;
    }
  },
});
type PointerLevels = typeof PointerAccuracy['none' | 'coarse' | 'fine'];
class ParsedPointer {
  constructor(
    public readonly accuracy: 'none' | 'coarse' | 'fine',
    public readonly any?: 'any'
  ) {}

  private get minLevel() {
    return PointerAccuracy[this.accuracy];
  }

  private primaryAccuracy(context: MatchMediaContext) {
    return PointerAccuracy.fromDevice(context.primaryPointingDevice);
  }

  private bestAccuracy(context: MatchMediaContext) {
    return Math.max(
      PointerAccuracy.fromDevice(context.primaryPointingDevice),
      PointerAccuracy.fromDevice(context.secondaryPointingDevice)
    ) as PointerLevels;
  }

  matches(context: MatchMediaContext) {
    const minLevel = this.minLevel;
    const deviceLevel =
      this.any === 'any'
        ? this.bestAccuracy(context)
        : this.primaryAccuracy(context);

    if (minLevel === PointerAccuracy.none) {
      return deviceLevel === PointerAccuracy.none;
    }

    return deviceLevel >= minLevel;
  }

  static *Parser() {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    const any: boolean = yield has('any-');
    yield 'pointer:';
    yield optionalWhitespace;
    const hover: 'none' | 'coarse' | 'fine' = yield ['none', 'coarse', 'fine'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedPointer(hover, any ? 'any' : undefined);
  }
}

/**
 https://www.w3.org/TR/mediaqueries-5/#hover
 */
class ParsedHover {
  constructor(
    public readonly hover: 'none' | 'hover',
    public readonly any?: 'any'
  ) {}

  private canPrimaryHover(context: MatchMediaContext) {
    switch (context.primaryPointingDevice) {
      case 'mouse':
        return true;
      default:
        return false;
    }
  }

  private canAnyHover(context: MatchMediaContext) {
    switch (context.secondaryPointingDevice) {
      case 'mouse':
        return true;
      default:
        return this.canPrimaryHover(context);
    }
  }

  matches(context: MatchMediaContext) {
    const canHover =
      this.any === 'any'
        ? this.canAnyHover(context)
        : this.canPrimaryHover(context);

    if (canHover) {
      return this.hover === 'hover';
    } else {
      return this.hover === 'none';
    }
  }

  static *Parser() {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    const any: boolean = yield has('any-');
    yield 'hover:';
    yield optionalWhitespace;
    const hover: 'none' | 'hover' = yield ['none', 'hover'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedHover(hover, any ? 'any' : undefined);
  }
}

// See https://www.w3.org/TR/mediaqueries-5/#mq-syntax
const parsedMediaFeature = [
  ParsedMinWidth.Parser,
  ParsedOrientation.Parser,
  ParsedHover.Parser,
  ParsedPointer.Parser,
];
const parsedMediaInParens = [...parsedMediaFeature];
type ParsedMediaFeature = ParsedType<typeof parsedMediaFeature[-1]>;
type ParsedMediaInParens = ParsedMediaFeature;

class ParsedMediaCondition {
  constructor(
    public readonly first: ParsedMediaFeature,
    public readonly conditions?: ParsedMediaAnds | ParsedMediaOrs
  ) {}

  matches(context: MatchMediaContext) {
    const base = this.first.matches(context);
    if (this.conditions instanceof ParsedMediaAnds) {
      return base && this.conditions.matches(context);
    } else if (this.conditions instanceof ParsedMediaOrs) {
      return base || this.conditions.matches(context);
    } else {
      return base;
    }
  }

  static *Parser() {
    yield optionalWhitespace;
    const first: ParsedMediaInParens = yield parsedMediaInParens;
    const conditions: ParsedMediaAnds | ParsedMediaOrs | '' = yield [
      ParsedMediaAnds.Parser,
      ParsedMediaOrs.Parser,
      '',
    ];
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
      yield requiredWhitespace;
      yield 'and';
      yield requiredWhitespace;
      list.push(yield parsedMediaInParens);
    } while (yield hasMore);

    return new ParsedMediaAnds(list);
  }
}

class ParsedMediaOrs {
  constructor(public readonly list: ReadonlyArray<ParsedMediaInParens>) {}

  matches(context: MatchMediaContext) {
    return this.list.some((m) => m.matches(context));
  }

  static *Parser() {
    const list: Array<ParsedMediaInParens> = [];

    do {
      yield requiredWhitespace;
      yield 'or';
      yield requiredWhitespace;
      list.push(yield parsedMediaInParens);
    } while (yield hasMore);

    return new ParsedMediaOrs(list);
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
  const defaultRootFontSizePx = 16;
  const viewport = (width: number, height: number, zoom: number = 1) =>
    ({
      viewportWidth: width / zoom,
      viewportHeight: height / zoom,
      viewportZoom: zoom,
    } as const);

  const screen = (
    viewport: Pick<
      MatchMediaContext,
      'viewportWidth' | 'viewportHeight' | 'viewportZoom'
    >,
    primaryPointingDevice: 'touchscreen' | 'mouse' | undefined = 'touchscreen',
    secondaryPointingDevice?: 'touchscreen' | 'mouse'
  ) =>
    ({
      mediaType: 'screen',
      ...viewport,
      rootFontSizePx: defaultRootFontSizePx,
      primaryPointingDevice,
      secondaryPointingDevice,
    } as const);

  const screenSized = (
    viewportWidth: number,
    viewportHeight: number,
    primaryPointingDevice: 'touchscreen' | 'mouse' | null = 'touchscreen',
    secondaryPointingDevice?: 'touchscreen' | 'mouse'
  ) =>
    ({
      mediaType: 'screen',
      viewportWidth,
      viewportHeight,
      viewportZoom: 1,
      rootFontSizePx: defaultRootFontSizePx,
      primaryPointingDevice: primaryPointingDevice ?? undefined,
      secondaryPointingDevice,
    } as const);

  const printSized = (viewportWidth: number, viewportHeight: number) =>
    ({
      mediaType: 'print',
      viewportWidth,
      viewportHeight,
      viewportZoom: 1,
      rootFontSizePx: defaultRootFontSizePx,
    } as const);

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
    matchMedia(screen(viewport(479, 100)), '(min-width: 30em)').matches
  ).toBe(false);
  expect(
    matchMedia(screen(viewport(480, 100)), '(min-width: 30em)').matches
  ).toBe(true);
  expect(
    matchMedia(screen(viewport(481, 100)), '(min-width: 30em)').matches
  ).toBe(true);

  expect(
    matchMedia(screen(viewport(480, 100, 0.5)), '(min-width: 15em)').matches
  ).toBe(true);
  expect(
    matchMedia(screen(viewport(480, 100, 2.0)), '(min-width: 15em)').matches
  ).toBe(true);
  expect(
    matchMedia(screen(viewport(480, 100, 2.1)), '(min-width: 15em)').matches
  ).toBe(false);

  expect(
    matchMedia(screen(viewport(480, 100, 0.5)), '(min-width: 60em)').matches
  ).toBe(true);
  expect(
    matchMedia(screen(viewport(480, 100, 0.55)), '(min-width: 60em)').matches
  ).toBe(false);
  expect(
    matchMedia(screen(viewport(480, 100, 2.0)), '(min-width: 60em)').matches
  ).toBe(false);

  expect(
    matchMedia(screen(viewport(479, 100)), '(min-width: 30rem)').matches
  ).toBe(false);
  expect(
    matchMedia(screen(viewport(480, 100)), '(min-width: 30rem)').matches
  ).toBe(true);
  expect(
    matchMedia(screen(viewport(481, 100)), '(min-width: 30rem)').matches
  ).toBe(true);

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
    matchMedia(screenSized(100, 100, 'touchscreen'), '(hover: none)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(hover: hover)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-hover: none)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-hover: hover)')
      .matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(pointer: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(pointer: coarse)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(pointer: fine)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-pointer: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-pointer: coarse)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-pointer: fine)').matches
  ).toBe(false);

  expect(
    matchMedia(screenSized(100, 100, 'touchscreen', 'mouse'), '(hover: none)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen', 'mouse'), '(hover: hover)')
      .matches
  ).toBe(false);
  expect(
    matchMedia(
      screenSized(100, 100, 'touchscreen', 'mouse'),
      '(any-hover: none)'
    ).matches
  ).toBe(false);
  expect(
    matchMedia(
      screenSized(100, 100, 'touchscreen', 'mouse'),
      '(any-hover: hover)'
    ).matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen', 'mouse'), '(any-pointer: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen', 'mouse'), '(any-pointer: coarse)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen', 'mouse'), '(any-pointer: fine)').matches
  ).toBe(true);

  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(hover: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(hover: hover)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(any-hover: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(any-hover: hover)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(pointer: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(pointer: coarse)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(pointer: fine)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(any-pointer: none)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(any-pointer: coarse)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'mouse'), '(any-pointer: fine)').matches
  ).toBe(true);

  expect(
    matchMedia(screenSized(100, 100, 'mouse', 'touchscreen'), '(hover: none)')
      .matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'mouse', 'touchscreen'), '(hover: hover)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(
      screenSized(100, 100, 'mouse', 'touchscreen'),
      '(any-hover: none)'
    ).matches
  ).toBe(false);
  expect(
    matchMedia(
      screenSized(100, 100, 'mouse', 'touchscreen'),
      '(any-hover: hover)'
    ).matches
  ).toBe(true);

  expect(matchMedia(screenSized(100, 100, null), '(hover: none)').matches).toBe(
    true
  );
  expect(
    matchMedia(screenSized(100, 100, null), '(hover: hover)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, null), '(any-hover: none)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, null), '(any-hover: hover)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, null), '(pointer: none)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, null), '(pointer: coarse)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, null), '(pointer: fine)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, null), '(any-pointer: none)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, null), '(any-pointer: coarse)').matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, null), '(any-pointer: fine)').matches
  ).toBe(false);

  expect(
    matchMedia(screenSized(480, 100), 'screen and (min-width: 480px)').matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(480, 100), 'only screen and (min-width: 480px)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(
      screenSized(480, 100),
      'only screen and (min-width: 480px) and (orientation: landscape)'
    ).matches
  ).toBe(true);
  expect(
    matchMedia(
      screenSized(480, 100, 'touchscreen'),
      'only screen and (min-width: 480px) and (orientation: landscape) and (any-hover: hover)'
    ).matches
  ).toBe(false);
  expect(
    matchMedia(
      screenSized(480, 100, 'touchscreen', 'mouse'),
      'only screen and (min-width: 480px) and (orientation: landscape) and (any-hover: hover)'
    ).matches
  ).toBe(true);
  expect(
    matchMedia(
      screenSized(480, 100, 'touchscreen', 'mouse'),
      'not print and (min-width: 480px) and (orientation: landscape) and (any-hover: hover)'
    ).matches
  ).toBe(true);

  expect(
    matchMedia(
      screenSized(480, 100),
      '(orientation: landscape) or (orientation: portrait)'
    ).matches
  ).toBe(true);
});
