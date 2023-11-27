import { describe, expect, it } from "./test-deps.ts";
import { has, hasMore, mustEnd, parse } from "./index.ts";
import type { ParsedType, ParseGenerator } from "./index.ts";

const test = Deno.test;

describe("parse()", () => {
  describe("failing", () => {
    test("array of wrong substrings", () => {
      expect(parse("abcdef", ["abc", "wrong"])).toEqual({
        remaining: "def",
        success: false,
        failedOn: { iterationCount: 1, yielded: "wrong" },
      });
    });

    test("yielding string after start", () => {
      expect(
        parse(
          "abc",
          (function* () {
            yield "bc";
          })(),
        ),
      ).toEqual({
        success: false,
        remaining: "abc",
        failedOn: { iterationCount: 0, yielded: "bc" },
      });
    });

    test("yielding wrong string", () => {
      expect(
        parse(
          "abcDEF",
          (function* () {
            yield "abc";
            yield "def";
          })(),
        ),
      ).toEqual({
        success: false,
        remaining: "DEF",
        failedOn: { iterationCount: 1, yielded: "def" },
      });
    });
  });

  describe("succeeding iterables", () => {
    it("accepts substrings", () => {
      expect(parse("abcdef", ["abc", "def"])).toEqual({
        remaining: "",
        success: true,
      });
    });

    it("accepts array of substrings", () => {
      expect(parse("abcdef", [["123", "abc"], "def"])).toEqual({
        remaining: "",
        success: true,
      });
    });

    it("only replaces first match", () => {
      expect(parse("abc123abc", ["abc", "123", "abc"])).toEqual({
        remaining: "",
        success: true,
      });
    });
  });

  describe("succeeding generator functions", () => {
    it("accepts substrings", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            yield "abc";
            yield "def";
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
      });
    });

    it("accepts empty string", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            yield "";
            yield "abc";
            yield "";
            yield "def";
            yield "";
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
      });
    });

    it("accepts array of substrings", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            const found: string = yield ["abc", "123"];
            yield "def";
            return { found };
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          found: "abc",
        },
      });
    });

    it("accepts array of substrings", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            const found: string = yield ["123", "abc"];
            yield "def";
            return { found };
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          found: "abc",
        },
      });
    });

    it("accepts Set of substrings", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            const found: string = yield new Set(["123", "abc"]);
            yield "def";
            return { found };
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          found: "abc",
        },
      });
    });
    it("accepts Set of substrings", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            const found: string = yield "abc";
            yield "def";
            return { found };
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          found: "abc",
        },
      });
    });

    it("accepts regex", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            yield /^abc/;
            yield /^def$/;
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
      });
    });

    it("accepts newlines as string and regex", () => {
      expect(
        parse(
          "\n\n",
          (function* () {
            yield "\n";
            yield /^\n/;
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
      });
    });

    it("yields result from regex", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            const [found1]: [string] = yield /^abc/;
            const [found2]: [string] = yield /^def/;
            return { found1, found2 };
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          found1: "abc",
          found2: "def",
        },
      });
    });

    it("accepts regex with capture groups", () => {
      expect(
        parse(
          "abcdef",
          (function* () {
            const [whole, first, second]: [
              string,
              string,
              string,
            ] = yield /^a(b)(c)/;
            const [found2]: [string] = yield /^def/;
            return { whole, first, second, found2 };
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          whole: "abc",
          first: "b",
          second: "c",
          found2: "def",
        },
      });
    });

    it("accepts yield delegating to other generator function", () => {
      function* BCD() {
        yield "b";
        yield "c";
        yield "d";
        return { bcd: true };
      }

      expect(
        parse(
          "abcdef",
          (function* () {
            yield "a";
            const result = yield* BCD();
            yield "ef";
            return result;
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          bcd: true,
        },
      });
    });

    it("accepts yielding array of other generator functions", () => {
      function* BCD() {
        yield "b";
        yield "c";
        yield "d";
        return { bcd: true };
      }

      function* BAD() {
        yield "b";
        yield "a";
        yield "d";
        return { bad: true };
      }

      expect(
        parse(
          "abcdef",
          (function* () {
            yield "a";
            const result = yield [BAD, BCD];
            yield "ef";
            return result;
          })(),
        ),
      ).toEqual({
        remaining: "",
        success: true,
        result: {
          bcd: true,
        },
      });
    });
  });

  describe("IP Address", () => {
    function* Digit() {
      const [digit]: [string] = yield /^\d+/;
      const value = parseInt(digit, 10);
      if (value < 0 || value > 255) {
        return new Error(`Digit must be between 0 and 255, was ${value}`);
      }
      return value;
    }

    function* IPAddress() {
      const first: number = yield Digit;
      yield ".";
      const second: number = yield Digit;
      yield ".";
      const third: number = yield Digit;
      yield ".";
      const fourth: number = yield Digit;
      yield mustEnd;
      return [first, second, third, fourth];
    }

    it("accepts valid IP addresses", () => {
      expect(parse("1.2.3.4", IPAddress())).toEqual({
        success: true,
        result: [1, 2, 3, 4],
        remaining: "",
      });

      expect(parse("255.255.255.255", IPAddress())).toEqual({
        success: true,
        result: [255, 255, 255, 255],
        remaining: "",
      });
    });

    it("rejects invalid 1.2.3.256", () => {
      const result = parse("1.2.3.256", IPAddress());
      expect(result.success).toBe(false);
      expect(result.remaining).toBe("256");
      expect((result as any).failedOn.nested.yield).toEqual(
        new Error("Digit must be between 0 and 255, was 256"),
      );
    });

    it("rejects invalid 1.2.3.4.5", () => {
      const result = parse("1.2.3.4.5", IPAddress());
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(".5");
      expect((result as any).failedOn.nested.yield).toEqual(mustEnd);
    });
  });

  describe("CSS", () => {
    type Selector = string;
    interface Declaraction {
      property: string;
      value: string;
    }
    interface Rule {
      selectors: Array<Selector>;
      declarations: Array<Declaraction>;
    }

    const whitespaceMay = /^\s*/;

    function* PropertyParser() {
      const [name]: [string] = yield /^[-a-z]+/;
      return name;
    }

    function* ValueParser() {
      const [rawValue]: [string] = yield /^(-?\d+(rem|em|%|px|)|[-a-z]+)/;
      return rawValue;
    }

    function* DeclarationParser() {
      const name: string = yield PropertyParser;
      yield whitespaceMay;
      yield ":";
      yield whitespaceMay;
      const rawValue: string = yield ValueParser;
      yield whitespaceMay;
      yield ";";
      return { name, rawValue };
    }

    function* RuleParser():
      | Generator<RegExp, Rule, [string] & ReadonlyArray<string>>
      | Generator<() => ParseGenerator<boolean>, Rule, boolean>
      | Generator<
        () => typeof DeclarationParser,
        Rule,
        ParsedType<typeof DeclarationParser>
      >
      | Generator<unknown, Rule, unknown> {
      const declarations: Array<Declaraction> = [];

      const [selector]: [string] = yield /^(:root|[*]|[a-z][\w]*)/;

      yield whitespaceMay;
      yield "{";
      yield whitespaceMay;
      while ((yield has("}")) === false) {
        yield whitespaceMay;
        declarations.push((yield DeclarationParser) as unknown as Declaraction);
        yield whitespaceMay;
      }

      return { selectors: [selector], declarations } as Rule;
    }

    function* RulesParser(): ParseGenerator<Array<Rule>> {
      const rules: Array<Rule> = [];

      yield whitespaceMay;
      while (yield hasMore) {
        rules.push(yield RuleParser);
        yield whitespaceMay;
      }
      return rules;
    }

    const code = `
    :root {
      --first-var: 42rem;
      --second-var: 15%;
    }

    * {
      font: inherit;
      box-sizing: border-box;
    }

    h1 {
      margin-bottom: 1em;
    }
    `;

    it("parses", () => {
      expect(parse(code, RulesParser())).toEqual({
        success: true,
        result: [
          {
            selectors: [":root"],
            declarations: [
              {
                name: "--first-var",
                rawValue: "42rem",
              },
              {
                name: "--second-var",
                rawValue: "15%",
              },
            ],
          },
          {
            selectors: ["*"],
            declarations: [
              {
                name: "font",
                rawValue: "inherit",
              },
              {
                name: "box-sizing",
                rawValue: "border-box",
              },
            ],
          },
          {
            selectors: ["h1"],
            declarations: [
              {
                name: "margin-bottom",
                rawValue: "1em",
              },
            ],
          },
        ],
        remaining: "",
      });
    });
  });
});
