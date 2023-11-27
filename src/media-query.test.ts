// https://www.w3.org/TR/mediaqueries-5/
import { afterEach, beforeEach, describe, expect, it } from './test-deps.ts';
import {
  mustEnd,
  optional,
  parse,
  ParsedType,
  ParseGenerator,
  ParseResult,
  ParseYieldable,
} from './index.ts';

const optionalWhitespace = /^\s*/;
const requiredWhitespace = /^\s+/;

export function has(prefix: string | RegExp): () => ParserGenerator<boolean> {
  return function* (): ParserGenerator<boolean> {
    const [match] = yield [prefix, ''];
    return match !== '';
  };
}

export function* hasMore(): ParserGenerator<boolean> {
  const { index }: { index: number } = yield /$/;
  return index > 0;
  // return !(yield isEnd);
}

function* ParseInt(): ParserGenerator<number> {
  const isNegative = Boolean(yield has('-'));
  const [stringValue] = yield /^\d+/;
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

  static *Parser(): ParserGenerator<ParsedMediaType> {
    yield optionalWhitespace;
    yield /^only\s+/;
    const [mediaType] = yield ['screen', 'print'];
    return new ParsedMediaType(mediaType as 'screen' | 'print');
  }
}

class ParsedNotMediaType {
  constructor(public readonly mediaType: 'screen' | 'print' | 'all') {}

  matches(context: { mediaType: 'screen' | 'print' }) {
    if (this.mediaType === 'all') return false;
    return this.mediaType !== context.mediaType;
  }

  static *Parser(): ParserGenerator<ParsedNotMediaType> {
    yield optionalWhitespace;
    yield 'not';
    yield requiredWhitespace;
    const [mediaType] = yield ['screen', 'print'];
    return new ParsedNotMediaType(mediaType as ParsedNotMediaType['mediaType']);
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

  static *Parser(): ParserGenerator<ParsedMinWidth, number> {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    yield 'min-width:';
    yield optionalWhitespace;
    const { value } = yield ParseInt;
    const [unit] = yield ['px', 'em', 'rem'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedMinWidth(value.valueOf(), unit as 'px' | 'em' | 'rem');
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

  static *Parser(): ParserGenerator<ParsedOrientation> {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    yield 'orientation:';
    yield optionalWhitespace;
    const [orientation] = yield ['portrait', 'landscape'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedOrientation(orientation as 'portrait' | 'landscape');
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
type PointerLevels = (typeof PointerAccuracy)['none' | 'coarse' | 'fine'];
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

  static *Parser(): ParserGenerator<ParsedPointer> {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    const any = Boolean(yield has('any-'));
    yield 'pointer:';
    yield optionalWhitespace;
    const [hover] = yield ['none', 'coarse', 'fine'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedPointer(
      hover as 'none' | 'coarse' | 'fine',
      any ? 'any' : undefined
    );
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

  static *Parser(): ParserGenerator<ParsedHover> {
    yield optionalWhitespace;
    yield '(';
    yield optionalWhitespace;
    const any = Boolean(yield has('any-'));
    yield 'hover:';
    yield optionalWhitespace;
    const [hover] = yield ['none', 'hover'];
    yield optionalWhitespace;
    yield ')';
    return new ParsedHover(hover as 'none' | 'hover', any ? 'any' : undefined);
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
// type ParsedMediaFeature = ParsedType<(typeof parsedMediaFeature)[-1]>;
type ParsedMediaFeature =
  | ParsedMinWidth
  | ParsedOrientation
  | ParsedHover
  | ParsedPointer;
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

type GetYield<T, Result> = T extends {
  next(...args: [unknown]): IteratorResult<infer A, Result>;
}
  ? A
  : never;

const internal = Symbol('internal');
class YieldedValue<T = never, S extends string = string> {
  constructor(stringValue: string) {
    this[internal] = stringValue;
  }

  get value(): T {
    return this[internal];
  }

  get index(): number {
    return 0;
  }

  *[Symbol.iterator](): IterableIterator<S> {
    const a: Array<S> = this[internal];
    yield* a;
  }
}

type PrimitiveYield<T, S extends string> =
  | S
  | RegExp
  // | (() => Omit<Generator<unknown, T, unknown>, "next" | "return" | "throw">)
  // | (() => Omit<Generator<unknown, boolean, unknown>, "next" | "return" | "throw">)
  | (() => {
      [Symbol.iterator](): {
        next: {
          (result: unknown): IteratorResult<unknown, unknown | boolean>;
          // (result: unknown): IteratorResult<unknown, boolean>
        };
      };
    })
  | Array<PrimitiveYield<T, S>>;

type Next<T extends object | number | boolean, Result> = {
  // next: {
  //   (s: string): IteratorResult<string, Result>;
  //   (matches: [string]): IteratorResult<RegExp, Result>;
  // };
  next: {
    // <S extends string = string>(result: YieldedValue<T, S>): IteratorResult<
    //   PrimitiveYield<T, S> | (() => Generator<unknown, boolean, unknown>),
    //   Result
    // >;
    (result: YieldedValue<T, string>): IteratorResult<
      typeof result extends YieldedValue<T, infer Z>
        ? Z extends string
          ? PrimitiveYield<T, Z>
          : PrimitiveYield<T, string>
        : PrimitiveYield<T, string>,
      Result
    >;
    // (result: YieldedValue<T>): IteratorResult<PrimitiveYield<T>, Result>;
    // <A extends string | [string]>(result: A): A extends string
    //   ? IteratorResult<string, Result>
    //   : A extends Iterable<string>
    //   ? IteratorResult<RegExp, Result>
    //   : never;
  };
};
// | {
//     next(
//       ...args: [boolean]
//     ): IteratorResult<() => Generator<unknown, boolean>, Result>;
//   }
// | {
//     next(...args: [T]): IteratorResult<() => Generator<unknown, T>, Result>;
//   }
// & {
//     next(s: string): IteratorResult<string, Result>;
//   }
// & {
//     next(matches: [string]): IteratorResult<RegExp, Result>;
//   }
// & {
//     next(): IteratorResult<unknown, Result>;
//   };
// type Next<T, Result> = GetYield<T, Result> extends RegExp ? {
//   next(
//     ...args: [[string] & ReadonlyArray<string>]
//   ): IteratorResult<RegExp, Result>;
// } : GetYield<T, Result> extends string ? {
//   next(
//     ...args: [string]
//   ): IteratorResult<string, Result>;
// } : never;

// type Next<T> = {
//   next(
//     ...args: [[string] & ReadonlyArray<string>]
//   ): IteratorResult<RegExp, ParsedMediaAnds>;
//   next(
//     ...args: [string]
//   ): IteratorResult<string, ParsedMediaAnds>;
// };
// type Next<T> = T extends RegExp ? {
//     next(
//       ...args: [[string] & ReadonlyArray<string>]
//     ): IteratorResult<RegExp, ParsedMediaAnds>;
//   }
//   : T extends string ? {
//       next(
//         ...args: [string]
//       ): IteratorResult<string, ParsedMediaAnds>;
//     }
//   : never;

type ParserGenerator<
  Result,
  NextValue extends object | number | boolean = never
> = {
  [Symbol.iterator](): Next<NextValue, Result>;
};

class ParsedMediaAnds {
  constructor(public readonly list: ReadonlyArray<ParsedMediaInParens>) {}

  matches(context: MatchMediaContext) {
    return this.list.every((m) => m.matches(context));
  }

  static *Parser(): ParserGenerator<ParsedMediaAnds, ParsedMediaInParens> {
    const list: Array<ParsedMediaInParens> = [];

    do {
      const [a, c] = yield requiredWhitespace;
      const [b] = yield 'and';
      yield requiredWhitespace;
      const { value: item } = yield parsedMediaInParens;
      list.push(item);
    } while (yield hasMore);

    return new ParsedMediaAnds(list);
  }
}

class ParsedMediaOrs {
  constructor(public readonly list: ReadonlyArray<ParsedMediaInParens>) {}

  matches(context: MatchMediaContext) {
    return this.list.some((m) => m.matches(context));
  }

  static *Parser(): ParserGenerator<ParsedMediaOrs, ParsedMediaInParens> {
    const list: Array<ParsedMediaInParens> = [];

    do {
      yield requiredWhitespace;
      yield 'or';
      yield requiredWhitespace;
      list.push((yield parsedMediaInParens).value);
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

  static *ParserA(): ParserGenerator<
    | ParsedMediaType
    | ParsedNotMediaType
    | ParsedMediaTypeThenConditionWithoutOr,
    ParsedMediaType | ParsedNotMediaType
  > {
    const mediaType = yield [ParsedMediaType.Parser, ParsedNotMediaType.Parser];

    const list: Array<ParsedMediaInParens> = [];

    if (list.length === 0) {
      return mediaType.value;
    } else {
      return new ParsedMediaTypeThenConditionWithoutOr(mediaType.value, list);
    }
  }

  static *Parser(): ParserGenerator<
    | ParsedMediaType
    | ParsedNotMediaType
    | ParsedMediaTypeThenConditionWithoutOr,
    ParsedMediaType | ParsedNotMediaType | ParsedMediaInParens
  > {
    const mediaType = (yield [
      ParsedMediaType.Parser,
      ParsedNotMediaType.Parser,
    ]) as YieldedValue<ParsedMediaType | ParsedNotMediaType>;

    const list: Array<ParsedMediaInParens> = [];

    while (yield has(/^\s+and\s/)) {
      list.push(
        ((yield parsedMediaInParens) as YieldedValue<ParsedMediaInParens>).value
      );
    }

    if (list.length === 0) {
      return mediaType.value;
    } else {
      return new ParsedMediaTypeThenConditionWithoutOr(mediaType.value, list);
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
  const parsed: ParseResult<ParsedMediaQuery['main']> = parse(
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

it('can parse "screen"', () => {
  const result = parse('screen', ParsedMediaQuery.Parser() as any);
  expect(result).toEqual({
    success: true,
    result: new ParsedMediaType('screen'),
    remaining: '',
  });
});

it('can parse (min-width: 480px)', () => {
  const result = parse('(min-width: 480px)', ParsedMediaQuery.Parser() as any);
  expect(result).toEqual({
    success: true,
    result: new ParsedMinWidth(480, 'px'),
    remaining: '',
  });
});

it('can parse (orientation: landscape)', () => {
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

it('can parse "screen and (min-width: 480px)"', () => {
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

it('can run matchMedia()', () => {
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
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-pointer: none)')
      .matches
  ).toBe(false);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-pointer: coarse)')
      .matches
  ).toBe(true);
  expect(
    matchMedia(screenSized(100, 100, 'touchscreen'), '(any-pointer: fine)')
      .matches
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
    matchMedia(
      screenSized(100, 100, 'touchscreen', 'mouse'),
      '(any-pointer: none)'
    ).matches
  ).toBe(false);
  expect(
    matchMedia(
      screenSized(100, 100, 'touchscreen', 'mouse'),
      '(any-pointer: coarse)'
    ).matches
  ).toBe(true);
  expect(
    matchMedia(
      screenSized(100, 100, 'touchscreen', 'mouse'),
      '(any-pointer: fine)'
    ).matches
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
