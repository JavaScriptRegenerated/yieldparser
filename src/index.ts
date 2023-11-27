export type ParsedType<A> = A extends { Parser: () => Generator }
  ? ParsedTypeForClass<A>
  : A extends (...args: unknown[]) => unknown ? ParsedTypeForFunction<A>
  : never;
type ParsedTypeForFunction<F extends (...args: unknown[]) => unknown> =
  ReturnType<F> extends Generator<unknown, infer Y> ? Y : never;
type ParsedTypeForClass<C extends { Parser: () => Generator }> = ReturnType<
  C["Parser"]
> extends Generator<unknown, infer Y> ? Y
  : never;

export type ParseItem<Result = unknown> =
  | string
  | RegExp
  | Iterable<ParseItem>
  | (() => Generator<ParseItem, Result, unknown>);
export type ParseYieldable<Result = unknown> = ParseItem<Result>;

export interface ParseError {
  iterationCount: number;
  yielded: ParseItem | Error;
  nested?: Array<ParseError>;
}

export type ParseResult<Result> =
  | {
    success: false;
    remaining: string;
    failedOn: ParseError;
  }
  | {
    success: true;
    remaining: string;
    result: Result;
  };

export type ParseYieldedValue<Input extends ParseItem> = Input extends RegExp
  ? RegExpMatchArray
  : string;

export type ParseGenerator<Result = unknown> =
  | Generator<ParseItem<unknown>, Result, string | RegExpMatchArray>
  | Generator<ParseItem<unknown>, Result, unknown>
  | Generator<unknown, Result, undefined>
  | Iterable<ParseItem>;

export function parse<Result = void>(
  input: string,
  iterable: ParseGenerator<Result>,
): ParseResult<Result> {
  let lastResult: ParseYieldedValue<ParseItem> | undefined;

  let iterationCount = -1;
  const iterator = iterable[Symbol.iterator]();

  main: while (true) {
    const nestedErrors: Array<ParseError> = [];

    iterationCount += 1;
    const next = iterator.next(lastResult as any);
    if (next.done) {
      if (next.value instanceof Error) {
        return {
          success: false,
          remaining: input,
          failedOn: {
            iterationCount,
            yielded: next.value,
          },
        };
      }

      return {
        success: true,
        remaining: input,
        result: next.value,
      };
    }

    const yielded = next.value as ParseItem;
    const choices =
      typeof yielded !== "string" && (yielded as any)[Symbol.iterator]
        ? (yielded as Iterable<ParseItem>)
        : [yielded];

    for (const choice of choices) {
      if (typeof choice === "string") {
        let found = false;
        const newInput = input.replace(choice, (_1, offset: number) => {
          found = offset === 0;
          return "";
        });
        if (found) {
          input = newInput;
          lastResult = choice;
          continue main;
        }
      } else if (choice instanceof RegExp) {
        if (["^", "$"].includes(choice.source[0]) === false) {
          throw new Error(`Regex must be from start: ${choice}`);
        }
        const match = input.match(choice);
        if (match) {
          lastResult = match;
          // input = input.replace(item, '');
          input = input.slice(match[0].length);
          continue main;
        }
      } else if (choice instanceof Function) {
        const choiceResult = parse(input, choice());
        if (choiceResult.success) {
          lastResult = choiceResult.result as any;
          input = choiceResult.remaining;
          continue main;
        } else if (choiceResult.failedOn) {
          nestedErrors.push(choiceResult.failedOn);
          // if (choiceResult.failedOn.iterationCount > 0) {
          //   return {
          //     success: false,
          //     remaining: input,
          //     failedOn: {
          //       iterationCount,
          //       yielded: choice,
          //       nested: nestedErrors.length === 0 ? undefined : nestedErrors,
          //     },
          //   };
          // }
        }
      }
    }

    return {
      success: false,
      remaining: input,
      failedOn: {
        iterationCount,
        yielded,
        nested: nestedErrors.length === 0 ? undefined : nestedErrors,
      },
    };
  }
}

export function* mustEnd() {
  yield /^$/;
}

export function* isEnd() {
  const { index }: { index: number } = yield /$/;
  return index === 0;
}

export function* hasMore() {
  const { index }: { index: number } = yield /$/;
  return index > 0;
  // return !(yield isEnd);
}

export function has(prefix: ParseYieldable): () => ParseGenerator<boolean> {
  return function* () {
    return (yield [prefix, ""]) !== "";
  };
}

export function optional(
  ...potentials: Array<ParseYieldable | any>
): () => ParseGenerator<any> {
  return function* () {
    const result = yield [...potentials, ""];
    return result === "" ? undefined : result;
  };
}

export function lookAhead(
  regex: RegExp,
): () => Generator<RegExp, RegExpMatchArray, RegExpMatchArray> {
  const lookAheadRegex = new RegExp(`^(?=${regex.source})`);
  return function* () {
    return yield lookAheadRegex;
  };
}

////////

export function invert<Result = void>(
  needle: {},
  iterable: ParseGenerator<Result>,
): string | null {
  const result = invertInner(needle, iterable);
  if (result !== null && result.type === "done") {
    return result.components.join("");
  }

  return null;
}

function invertInner<Result = void>(
  needle: Record<string, string>,
  iterable: ParseGenerator<Result>,
): { type: "done" | "prefix"; components: ReadonlyArray<string> } | null {
  let reply: unknown | undefined;

  const expectedKeys = Object.keys(needle);
  if (expectedKeys.length === 0) {
    throw new Error("Expected object must have keys.");
  }
  const iterator = iterable[Symbol.iterator]();
  const components: Array<string> = [];
  const regexpMap = new Map<Symbol, { regexp: RegExp; index: number }>();

  while (true) {
    const next = iterator.next(reply as any);
    if (next.done) {
      if (next.value instanceof Error) {
        return null;
      }

      const result = next.value;
      if (result == null) {
        return { type: "prefix", components: Object.freeze(components) };
      }

      const resultKeys = new Set(Object.keys(result));
      if (
        expectedKeys.length === resultKeys.size &&
        expectedKeys.every((key) => {
          if (!resultKeys.has(key)) {
            return false;
          }

          if (typeof result[key] === "symbol") {
            const entry = regexpMap.get(result[key]);
            if (entry !== undefined) {
              if (
                entry.regexp.test(needle[key])
              ) {
                components[entry.index] = needle[key];
                return true;
              }
            }
          }

          return result[key] === needle[key];
        })
      ) {
        return { type: "done", components: Object.freeze(components) };
      } else {
        return null;
      }
    }

    const yielded = next.value;
    const choices =
      typeof yielded !== "string" && (yielded as any)[Symbol.iterator]
        ? (yielded as Iterable<unknown>)
        : [yielded];

    for (const choice of choices) {
      reply = undefined;

      if (typeof choice === "string") {
        components.push(choice);
        reply = choice;
        break; // Assume first string is the canonical version.
      } else if (choice instanceof RegExp) {
        const index = components.length;
        components.push(""); // This will be replaced later using the index.
        // components.push('???'); // This will be replaced later using the index.
        const s = Symbol();
        regexpMap.set(s, { regexp: choice, index });
        reply = [s];
      } else if (choice instanceof Function) {
        const result = invertInner(needle, choice());
        if (result != null) {
          if (result.type === "done") {
            return {
              type: "done",
              components: Object.freeze(components.concat(result.components)),
            };
          } else {
            components.push(...result.components);
          }
        }
      }
    }
  }
}


// type CustomFunc<T> = (p: Parser) => T;

// interface MatcherFunc {
//   (s: string): string;
//   (r: RegExp): [string];
//   <T>(c: CustomFunc<T>): T;
// }

// type Parser = MatcherFunc & {
//   peek: MatcherFunc;
//   error(description: string): void;
// };

// function Digit(this: Parser): number {
//   const [digits] = this(/^\d+$/);
//   const value = parseInt(digits, 10);

//   if (value < 0 || value > 255) {
//     this.error(`value must be between 0 and 255, was ${value}`);
//   }

//   return value;
// }

// function IPAddress(this: Parser): [number, number, number, number] {
//   const first = this(Digit);
//   this(".");
//   const second = this(Digit);
//   this(".");
//   const third = this(Digit);
//   this(".");
//   const fourth = this(Digit);

//   return [first, second, third, fourth];
// }
