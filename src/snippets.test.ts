import { describe, expect, it } from "vite-plus/test";
import { createSnippet } from "./snippets.ts";

describe("snippet generation", () => {
  it("creates component-only snippet output", () => {
    const snippet = createSnippet("anchor-positioning", "cdn", "component");

    expect(snippet).toBe('<baseline-status featureId="anchor-positioning"></baseline-status>');
  });

  it("creates a CDN snippet for direct HTML use", () => {
    const snippet = createSnippet("anchor-positioning", "cdn");

    expect(snippet).toContain("https://cdn.jsdelivr.net/npm/baseline-status@1/");
    expect(snippet).toContain('<baseline-status featureId="anchor-positioning"></baseline-status>');
  });

  it("creates a full CDN snippet when requested", () => {
    const snippet = createSnippet("anchor-positioning", "cdn", "full");

    expect(snippet).toContain("https://cdn.jsdelivr.net/npm/baseline-status@1/");
    expect(snippet).toContain('<baseline-status featureId="anchor-positioning"></baseline-status>');
  });

  it("creates a bundler snippet for installed package use", () => {
    const snippet = createSnippet("container-queries", "bundler");

    expect(snippet).toContain('import "baseline-status";');
    expect(snippet).toContain('<baseline-status featureId="container-queries"></baseline-status>');
  });
});
