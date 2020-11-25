export type ParseItem = string | Iterable<string> | RegExp;

export type ParseResult<Result> =
  | {
      success: false;
      remaining: string;
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

  const iterator = iterable[Symbol.iterator]();

  main: while (true) {
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
    console.log('choices', choices, yielded, (yielded as any)[Symbol.iterator]);

    for (const choice of choices) {
      console.log("CHOICE", choice);
      if (typeof choice === 'string') {
        console.log('possible choice', choice);
        let found = false;
        const newInput = input.replace(choice, (_1, offset: number) => {
          found = offset === 0;
          return '';
        });
        if (found) {
          input = newInput;
          lastResult = choice;
          continue main;
        } else {
          console.log('bad choice', choice);
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
        console.log("IS GEN", choice);
        const choiceResult = parse(input, choice());
        console.log("RESULT", choiceResult);
        if (choiceResult.success) {
          lastResult = choiceResult.result as any;
          input = choiceResult.remaining;
          continue main;
        }
      }
    }

    return {
      success: false,
      remaining: input,
    };
  }
}
