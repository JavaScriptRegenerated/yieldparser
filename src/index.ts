export type ParseItem = string | RegExp;

type ParseResult<Result = void> = {
  success: false;
  remaining: string;
} | {
  success: true;
  remaining: string;
  result: Result;
}

export function parse(input: string, generator: Generator<ParseItem>): ParseResult {
  let lastResult: string | undefined = undefined;
  while (true) {
    const { value: item, done } = generator.next(lastResult);
    if (done) {
      return {
        success: true,
        remaining: input,
        result: item,
      };
    }
  
    if (typeof item === 'string') {
      if (input.startsWith(item)) {
        input = input.replace(item, '');
        lastResult = item;
        continue;
      } else {
        return {
          success: false,
          remaining: input
        };
      }
    } else if (item instanceof RegExp) {
      console.log('regex', item, input, input.match(item));
      const match = input.match(item);
      if (match) {
        lastResult = match[0];
        input = input.replace(item, '');
        continue;
      } else {
        return {
          success: false,
          remaining: input
        };
      }
    }
  }
}
