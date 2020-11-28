export type ParseItem = string | Iterable<string> | RegExp;

export interface ParseError {
  iterationCount: number;
  yielded: ParseItem;
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
  | Generator<
      string | Iterable<string> | RegExp,
      Result,
      string | RegExpMatchArray
    >
  | Generator<unknown, Result, undefined>
  | Iterable<ParseItem>;

export function parse<Result = void>(
  input: string,
  iterable: ParseGenerator<Result>
): ParseResult<Result> {
  let lastResult: ParseYieldedValue<ParseItem> | undefined;

  let iterationCount = -1;
  const iterator = iterable[Symbol.iterator]();

  main: while (true) {
    const nestedErrors: Array<ParseError> = [];

    iterationCount += 1;
    const next = iterator.next(lastResult as any);
    if (next.done) {
      return {
        success: true,
        remaining: input,
        result: next.value,
      };
    }

    const yielded = next.value as ParseItem;
    const choices =
      typeof yielded !== 'string' && (yielded as any)[Symbol.iterator]
        ? (yielded as Iterable<ParseItem>)
        : [yielded];

    for (const choice of choices) {
      if (typeof choice === 'string') {
        let found = false;
        const newInput = input.replace(choice, (_1, offset: number) => {
          found = offset === 0;
          return '';
        });
        if (found) {
          input = newInput;
          lastResult = choice;
          continue main;
        }
      } else if (choice instanceof RegExp) {
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

export function* isEnd() {
  const { index }: { index: number } = yield /$/;
  return index === 0;
}
