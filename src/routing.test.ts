import { mustEnd, parse, ParseGenerator } from "./index";

describe("Router", () => {
  type Route =
    | { type: "home" }
    | { type: "about" }
    | { type: "albums" }
    | { type: "album"; id: string }
    | { type: "albumArt"; id: string };

  function* Home() {
    yield "/";
    yield mustEnd;
    return { type: "home" } as Route;
  }

  function* About() {
    yield "/about";
    yield mustEnd;
    return { type: "about" } as Route;
  }

  const Albums = {
    *List() {
      yield "/albums";
      yield mustEnd;
      return { type: "albums" } as Route;
    },
    *ItemPrefix() {
      yield "/albums/";
      const [id]: [string] = yield /^\d+/;
      return { id };
    },
    *Item() {
      const { id }: { id: string } = yield Albums.ItemPrefix;
      yield mustEnd;
      return { type: "album", id } as Route;
    },
    *ItemArt() {
      const { id }: { id: string } = yield Albums.ItemPrefix;
      yield "/art";
      yield mustEnd;
      return { type: "albumArt", id } as Route;
    },
  };

  function* AlbumRoutes() {
    return yield [Albums.List, Albums.Item, Albums.ItemArt];
  }

  function* Route() {
    return yield [Home, About, AlbumRoutes];
  }

  it("works with home", () => {
    expect(parse("/", Route())).toEqual({
      success: true,
      result: { type: "home" },
      remaining: "",
    });
  });
  it("works with about", () => {
    expect(parse("/about", Route())).toEqual({
      success: true,
      result: { type: "about" },
      remaining: "",
    });
  });
  it("works with albums", () => {
    expect(parse("/albums", Route())).toEqual({
      success: true,
      result: { type: "albums" },
      remaining: "",
    });
  });
  it("works with album for id", () => {
    expect(parse("/albums/42", Route())).toEqual({
      success: true,
      result: { type: "album", id: "42" },
      remaining: "",
    });
  });
  it("works with album art for id", () => {
    expect(parse("/albums/42/art", Route())).toEqual({
      success: true,
      result: { type: "albumArt", id: "42" },
      remaining: "",
    });
  });
});

describe("Router reversal", () => {
  type Route =
    | { type: "home" }
    | { type: "about" }
    | { type: "terms" }
    | { type: "albums" }
    | { type: "album"; id: string }
    | { type: "albumArt"; id: string };

  function* Home() {
    yield "/";
    yield mustEnd;
    return { type: "home" } as Route;
  }

  function* About() {
    yield "/about";
    yield mustEnd;
    return { type: "about" } as Route;
  }

  function* Terms() {
    yield "/legal";
    yield "/terms";
    yield mustEnd;
    return { type: "terms" } as Route;
  }

  function* AlbumItem() {
    yield "/albums/";
    const [id]: [string] = yield /^\d+/;
    return { type: "album", id };
  }

  function* Route() {
    return yield [Home, About];
  }

  it("works", () => {
    expect(reverse({ type: "home" }, Home())).toEqual("/");
    expect(reverse({ type: "about" }, About())).toEqual("/about");
    expect(reverse({ type: "terms" }, Terms())).toEqual("/legal/terms");
    expect(reverse({ type: "album", id: "123" }, AlbumItem())).toEqual("/albums/123");
  });
});

function reverse<Result = void>(
  needle: {},
  iterable: ParseGenerator<Result>,
): string | null {
  let reply: unknown | undefined;

  const expectedKeys = Object.keys(needle);
  if (expectedKeys.length === 0) {
    throw new Error("Expected object must have keys.");
  }
  const iterator = iterable[Symbol.iterator]();
  const components: Array<string | RegExp> = [];
  const regexpMap = new Map<Symbol, { regexp: RegExp; index: number }>();

  while (true) {
    const next = iterator.next(reply as any);
    if (next.done) {
      if (next.value instanceof Error) {
        return null;
      }

      const result = next.value;
      const resultKeys = new Set(Object.keys(result));
      if (
        expectedKeys.length === resultKeys.size &&
        expectedKeys.every((key) => {
          if (!resultKeys.has(key)) {
            return false;
          }

          if (typeof result[key] === 'symbol') {
            const entry = regexpMap.get(result[key]);
            if (entry !== undefined) {
              if (entry.regexp.test(needle[key])) {
                components[entry.index] = needle[key];
                return true;
              }
            }
          }

          return result[key] === needle[key];
        })
      ) {
        return components.join('');
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
      if (typeof choice === "string") {
        components.push(choice);
        reply = choice;
      } else if (choice instanceof RegExp) {
        const index = components.length;
        components.push('???'); // This will be replaced later using the index.
        const s = Symbol();
        regexpMap.set(s, { regexp: choice, index });
        reply = [s];
      } else if (choice instanceof Function) {
          // TODO: call
      }
    }

    // return components.join("");
  }
}
