import { invert, mustEnd, parse } from "./index";

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

describe("Router inversion", () => {
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
    expect(invert({ type: "home" }, Home())).toEqual("/");
    expect(invert({ type: "about" }, About())).toEqual("/about");
    expect(invert({ type: "terms" }, Terms())).toEqual("/legal/terms");
  });

  it("works with single route definition with param", () => {
    expect(invert({ type: "album", id: "123" }, AlbumItem())).toEqual("/albums/123");
  })

  it("works with nested routes", () => {
    expect(invert({ type: "home" }, Route())).toEqual("/");
    expect(invert({ type: "about" }, Route())).toEqual("/about");
    expect(invert({ type: "terms" }, Route())).toEqual("/legal/terms");
  });

  it("works with routes with nested prefix", () => {
    expect(invert({ type: "blogArticle", slug: "hello-world" }, BlogArticle())).toEqual("/blog/hello-world");
  });
});
