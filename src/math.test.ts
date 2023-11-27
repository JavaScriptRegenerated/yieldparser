import { afterEach, beforeEach, describe, expect, it } from "./test-deps.ts";
import { has, hasMore, parse, ParseGenerator } from "./index.ts";

describe("math parser", () => {
  const whitespaceMay = /^\s*/;

  function* ParseInt() {
    const isNegative: boolean = yield has("-");
    const [stringValue]: [string] = yield /^\d+/;
    return parseInt(stringValue, 10) * (isNegative ? -1 : 1);
  }

  type Operator = "+" | "-" | "*" | "/";

  function* ParseOperator() {
    const operator: Operator = yield ["+", "-", "*", "/"];
    return operator;
  }

  function applyOperator(a: number, b: number, operator: Operator): number {
    switch (operator) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return a / b;
    }
  }

  function* MathExpression(): ParseGenerator {
    yield whitespaceMay;
    let current: number = yield ParseInt;

    while (yield hasMore) {
      yield whitespaceMay;
      const operator: Operator = yield ParseOperator;
      yield whitespaceMay;
      const other = yield ParseInt;

      current = applyOperator(current, other, operator);
    }

    return current;
  }

  Deno.test("many", () => {
    ([
      ["1 + 1", 2],
      ["1 + 2", 3],
      ["2 + 2", 4],
      ["21 + 19", 40],
      ["21 + -19", 2],
      ["-21 + 19", -2],
      ["-21 + -19", -40],
      ["0 - 10", -10],
      ["21 - 19", 2],
      ["-21 - 19", -40],
      ["1 * 1", 1],
      ["2 * 2", 4],
      ["12 * 12", 144],
      ["1 / 2", 0.5],
      ["10 / 2", 5],
      ["10 / 20", 0.5],
    ] as const).forEach(([input, output]) => {
      expect(parse(input, MathExpression())).toEqual({
        success: true,
        result: output,
        remaining: "",
      });
    });
  });
});
