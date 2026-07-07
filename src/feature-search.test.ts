import { describe, expect, it } from "vite-plus/test";
import {
  createFeatureIndex,
  getBaselineLabel,
  resolveFeature,
  searchFeatures,
  type FeatureMap,
} from "./feature-search.ts";

const fixtures: FeatureMap = {
  "anchor-positioning": {
    caniuse: ["css-anchor-positioning"],
    compat_features: ["css.properties.anchor-name"],
    description: "Anchor positioning places an element relative to another element.",
    kind: "feature",
    name: "Anchor positioning",
    status: { baseline: false },
  },
  "container-queries": {
    caniuse: ["css-container-queries"],
    compat_features: ["css.at-rules.container"],
    description: "Container queries apply styles based on container size.",
    kind: "feature",
    name: "Container queries",
    status: { baseline: "high" },
  },
  "intl-list-format": {
    compat_features: ["javascript.builtins.Intl.ListFormat"],
    description: "Intl.ListFormat creates localized lists.",
    kind: "feature",
    name: "Intl.ListFormat",
    status: { baseline: "low" },
  },
  "grid-lanes": {
    kind: "moved",
    redirect_target: "masonry",
  },
  masonry: {
    description: "Masonry layout places items in columns.",
    kind: "feature",
    name: "Masonry",
    status: { baseline: false },
  },
  "text-wrap-style": {
    kind: "split",
    redirect_targets: ["text-wrap", "text-wrap-balance", "text-wrap-pretty"],
  },
  "text-wrap": {
    description: "Text wrapping controls line breaking.",
    kind: "feature",
    name: "Text wrap",
    status: { baseline: "high" },
  },
};

describe("feature search", () => {
  const index = createFeatureIndex(fixtures);

  it("returns a direct match for an exact feature id", () => {
    const [result] = searchFeatures(index, "anchor-positioning");

    expect(result?.matchType).toBe("direct");
    expect(result?.entry.id).toBe("anchor-positioning");
  });

  it("returns a direct match for an exact feature name", () => {
    const [result] = searchFeatures(index, "Intl.ListFormat");

    expect(result?.matchType).toBe("direct");
    expect(result?.entry.id).toBe("intl-list-format");
  });

  it("limits suggested matches to the requested count", () => {
    const results = searchFeatures(index, "css", 2);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.matchType === "suggested")).toBe(true);
  });

  it("resolves moved features to their redirect target", () => {
    const moved = index.find((entry) => entry.id === "grid-lanes");
    const resolved = moved ? resolveFeature(moved, index) : undefined;

    expect(resolved?.id).toBe("masonry");
  });

  it("keeps split feature targets available for choices", () => {
    const split = index.find((entry) => entry.id === "text-wrap-style");

    expect(split?.redirectTargets).toEqual(["text-wrap", "text-wrap-balance", "text-wrap-pretty"]);
  });

  it("maps baseline values to human labels", () => {
    const high = index.find((entry) => entry.id === "container-queries");
    const low = index.find((entry) => entry.id === "intl-list-format");
    const limited = index.find((entry) => entry.id === "anchor-positioning");

    expect(high ? getBaselineLabel(high) : "").toBe("Widely available");
    expect(low ? getBaselineLabel(low) : "").toBe("Newly available");
    expect(limited ? getBaselineLabel(limited) : "").toBe("Limited availability");
  });
});
