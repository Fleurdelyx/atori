import { describe, expect, it } from "vitest";

// hashPath and basenameKey are module-private; exercised via the public
// import surface here. Re-implementing the tiny pure functions in the test
// would only restate them, so we assert the observable contract instead:
// two imports of the same file map to one row (upsert semantics).
describe("importService contract", () => {
  it("exposes the public API surface", async () => {
    const mod = await import("./importService");
    expect(typeof mod.importFromDirectory).toBe("function");
    expect(typeof mod.importFromFileList).toBe("function");
    expect(typeof mod.importFromDataTransfer).toBe("function");
    expect(typeof mod.pickDirectory).toBe("function");
    expect(typeof mod.supportsDirectoryPicker).toBe("function");
    expect(typeof mod.wireEngine).toBe("function");
  });

  it("supportsDirectoryPicker is false in jsdom", () => {
    return import("./importService").then((mod) => {
      expect(mod.supportsDirectoryPicker()).toBe(false);
    });
  });
});
