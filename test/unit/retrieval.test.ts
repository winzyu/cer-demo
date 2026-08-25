import { RetrievalRegistry } from "../../src/retrieval/RetrievalRegistry";
import { StubAdapter } from "../../src/retrieval/adapters/StubAdapter";
import { DEFAULT_TOP_K, MAX_TOP_K, resolveTopK } from "../../src/retrieval/options";
import type { RetrievalAdapter } from "../../src/types/retrieval.types";

/** A registry isolated from process env, so selection rules are tested directly. */
const registryWith = (
  defaultMode: string,
  debug: boolean,
  adapters: RetrievalAdapter[] = [new StubAdapter()],
): RetrievalRegistry => {
  const registry = new RetrievalRegistry({ defaultMode, debug });
  adapters.forEach((adapter) => registry.register(adapter));
  return registry;
};

const fakeAdapter = (mode: string): RetrievalAdapter => ({
  mode,
  getContext: async () => [{ id: `${mode}-1`, text: "x", source: `${mode}://s` }],
});

describe("resolveTopK", () => {
  it("defaults to the legacy default when unspecified", () => {
    expect(resolveTopK()).toBe(DEFAULT_TOP_K);
    expect(resolveTopK({})).toBe(DEFAULT_TOP_K);
  });

  it("clamps a request above the ceiling", () => {
    // Deliberately far above MAX_TOP_K, so this keeps testing clamping if the ceiling moves
    // again. It was raised 10 -> 50 on 2026-08-24; a literal equal to the cap would have
    // silently stopped testing anything.
    expect(resolveTopK({ topK: 9999 })).toBe(MAX_TOP_K);
    expect(resolveTopK({ topK: MAX_TOP_K + 1 })).toBe(MAX_TOP_K);
  });

  it("returns 0 for non-positive requests", () => {
    expect(resolveTopK({ topK: 0 })).toBe(0);
    expect(resolveTopK({ topK: -3 })).toBe(0);
  });
});

describe("StubAdapter", () => {
  const adapter = new StubAdapter();

  it("registers under the 'stub' mode", () => {
    expect(adapter.mode).toBe("stub");
  });

  it("returns chunks matching the Chunk contract", async () => {
    const chunks = await adapter.getContext("what is ORP?");

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((chunk) => {
      expect(typeof chunk.id).toBe("string");
      expect(typeof chunk.text).toBe("string");
      expect(typeof chunk.source).toBe("string");
    });
  });

  it("caps results at topK", async () => {
    const chunks = await adapter.getContext("what is ORP?", { topK: 2 });
    expect(chunks).toHaveLength(2);
  });

  it("returns nothing for an empty query", async () => {
    expect(await adapter.getContext("")).toEqual([]);
    expect(await adapter.getContext("   ")).toEqual([]);
  });

  it("returns nothing for a non-positive topK", async () => {
    expect(await adapter.getContext("what is ORP?", { topK: 0 })).toEqual([]);
  });

  it("marks its text as stub output so it cannot pass as grounded", async () => {
    const chunks = await adapter.getContext("what is ORP?");
    chunks.forEach((chunk) => expect(chunk.text).toContain("[STUB CONTEXT]"));
  });

  it("accepts injected chunks for test scenarios", async () => {
    const custom = new StubAdapter([{ id: "c1", text: "custom", source: "test://x" }]);
    expect(await custom.getContext("q")).toEqual([
      { id: "c1", text: "custom", source: "test://x" },
    ]);
  });
});

describe("RetrievalRegistry", () => {
  it("registers and looks up adapters by mode", () => {
    const registry = registryWith("stub", false);

    expect(registry.get("stub")).toBeInstanceOf(StubAdapter);
    expect(registry.get("nope")).toBeUndefined();
    expect(registry.modes()).toEqual(["stub"]);
  });

  it("rejects duplicate registration rather than silently replacing", () => {
    const registry = registryWith("stub", false);

    expect(() => registry.register(new StubAdapter())).toThrow(/already registered/);
  });

  it("lists modes sorted", () => {
    const registry = registryWith("stub", false, [
      new StubAdapter(),
      fakeAdapter("firestore-vector"),
      fakeAdapter("firestore-direct"),
    ]);

    expect(registry.modes()).toEqual(["firestore-direct", "firestore-vector", "stub"]);
  });

  describe("resolve", () => {
    it("uses the configured default when no override is requested", () => {
      const registry = registryWith("stub", false);

      expect(registry.resolve().mode).toBe("stub");
      expect(registry.resolve(undefined).mode).toBe("stub");
      expect(registry.resolve("").mode).toBe("stub");
    });

    it("IGNORES a requested override when DEBUG_RETRIEVAL is false", () => {
      const registry = registryWith("stub", false, [
        new StubAdapter(),
        fakeAdapter("firestore-direct"),
      ]);

      // Ignored, not rejected: a production caller must not pick the strategy.
      expect(registry.resolve("firestore-direct").mode).toBe("stub");
    });

    it("ignores an override naming an unknown mode when debug is off", () => {
      const registry = registryWith("stub", false);

      expect(registry.resolve("does-not-exist").mode).toBe("stub");
    });

    it("HONORS a requested override when DEBUG_RETRIEVAL is true", () => {
      const registry = registryWith("stub", true, [
        new StubAdapter(),
        fakeAdapter("firestore-direct"),
      ]);

      expect(registry.resolve("firestore-direct").mode).toBe("firestore-direct");
    });

    it("trims a requested override", () => {
      const registry = registryWith("stub", true, [
        new StubAdapter(),
        fakeAdapter("firestore-direct"),
      ]);

      expect(registry.resolve("  firestore-direct  ").mode).toBe("firestore-direct");
    });

    it("rejects an unknown override as a 400 when debug is on", () => {
      const registry = registryWith("stub", true);

      expect(() => registry.resolve("does-not-exist")).toThrow(/Unknown retrieval mode/);
      try {
        registry.resolve("does-not-exist");
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).toBe(400);
      }
    });

    it("fails loudly when DEFAULT_RETRIEVAL names an unregistered mode", () => {
      const registry = registryWith("firestore-direct", false);

      expect(() => registry.resolve()).toThrow(/is not registered/);
    });
  });
});

describe("the shared registry", () => {
  it("has the stub adapter registered at import time", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { retrievalRegistry } = require("../../src/retrieval");
    expect(retrievalRegistry.modes()).toContain("stub");
  });
});
