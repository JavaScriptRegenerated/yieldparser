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

  function* BlogPrefix() {
    yield "/blog/";
  }

  function* BlogArticle() {
    yield BlogPrefix;
    const [slug]: [string] = yield /^.+/;
    return { type: "blogArticle", slug };
  }

  function* Route() {
    return yield [Home, About, Terms];
  }

  it("works with single route definition", () => {
    expect(reverse({ type: "home" }, Home())).toEqual("/");
    expect(reverse({ type: "about" }, About())).toEqual("/about");
    expect(reverse({ type: "terms" }, Terms())).toEqual("/legal/terms");
  });

  it("works with single route definition with param", () => {
    expect(reverse({ type: "album", id: "123" }, AlbumItem())).toEqual("/albums/123");
  })

  it("works with nested routes", () => {
    expect(reverse({ type: "home" }, Route())).toEqual("/");
    expect(reverse({ type: "about" }, Route())).toEqual("/about");
    expect(reverse({ type: "terms" }, Route())).toEqual("/legal/terms");
  });

  it("works with routes with nested prefix", () => {
    expect(reverse({ type: "blogArticle", slug: "hello-world" }, BlogArticle())).toEqual("/blog/hello-world");
  });
});

function reverse<Result = void>(
  needle: {},
  iterable: ParseGenerator<Result>,
): string | null {
  const result =  reverseInner(needle, iterable);
  if (result !== null && result.type === 'done') {
    return result.components.join('');
  }

  return null;
}

function reverseInner<Result = void>(
  needle: {},
  iterable: ParseGenerator<Result>,
): { type: 'done' | 'prefix'; components: ReadonlyArray<string> } | null {
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
        return { type: 'prefix', components: Object.freeze(components) };
      }

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
        return { type: 'done', components: Object.freeze(components) };
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
        components.push(''); // This will be replaced later using the index.
        // components.push('???'); // This will be replaced later using the index.
        const s = Symbol();
        regexpMap.set(s, { regexp: choice, index });
        reply = [s];
      } else if (choice instanceof Function) {
        const result = reverseInner(needle, choice());
        if (result != null) {
          if (result.type === 'done') {
            return { type: 'done', components: Object.freeze(components.concat(result.components)) };
          } else {
            components.push(...result.components);
          }
        }
      }
    }
  }
}
