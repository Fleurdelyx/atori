import { describe, expect, it } from "vitest";
import { parseLrc } from "./lrc";

describe("parseLrc", () => {
  it("parses timed lines with centisecond fractions", () => {
    const lines = parseLrc("[00:01.50] Hello\n[01:02.30] World")!;
    expect(lines).toEqual([
      { time: 1.5, text: "Hello" },
      { time: 62.3, text: "World" },
    ]);
  });

  it("supports millisecond fractions and colon separators", () => {
    const lines = parseLrc("[00:05:250] a")!;
    expect(lines[0].time).toBeCloseTo(5.25, 5);
  });

  it("expands multiple timestamps on one line", () => {
    const lines = parseLrc("[00:01.00][00:30.00] refrain")!;
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.time)).toEqual([1, 30]);
    expect(lines[0].text).toBe("refrain");
  });

  it("returns null for plain (untimed) lyrics", () => {
    expect(parseLrc("just some words\nno timestamps here")).toBeNull();
  });

  it("skips metadata tag lines but keeps untimed tails", () => {
    const lines = parseLrc("[ar:Artist]\n[ti:Title]\n[00:01.00] verse\nthe end")!;
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("verse");
    expect(lines[1].text).toBe("the end");
  });

  it("sorts out-of-order lines", () => {
    const lines = parseLrc("[00:20.00] later\n[00:03.00] earlier")!;
    expect(lines.map((l) => l.text)).toEqual(["earlier", "later"]);
  });
});
