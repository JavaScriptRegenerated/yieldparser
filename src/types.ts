type GetYield<T, Result> = T extends {
  next(...args: [unknown]): IteratorResult<infer A, Result>;
}
  ? A
  : never;

const internal = Symbol('internal');
export class YieldedValue<T = never, S extends string = string> {
  constructor(stringValue: S) {
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

export type PrimitiveYield<T, S extends string> =
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
  | ReadonlyArray<PrimitiveYield<T, S>>;

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
    <S2 extends string>(result: YieldedValue<T, S2 | string>): IteratorResult<
      typeof result extends YieldedValue<T, infer Z>
        ? S2 extends Z
          ? PrimitiveYield<T, string>
          : PrimitiveYield<T, string>
        : PrimitiveYield<T, string>,
      Result
    >;
    // (result: YieldedValue<T, string>): IteratorResult<
    //   typeof result extends YieldedValue<T, infer Z>
    //     ? PrimitiveYield<T, Z>
    //     : PrimitiveYield<T, string>,
    //   Result
    // >;
    // (result: 42): IteratorResult<42, Result>;
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

export type ParserGenerator<
  Result,
  NextValue extends object | number | boolean = never
> = {
  [Symbol.iterator](): Next<NextValue, Result>;
};
