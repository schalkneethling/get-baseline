export type SnippetMode = "cdn" | "bundler";
export type SnippetOutputMode = "component" | "full";

export function createSnippet(
  featureId: string,
  mode: SnippetMode,
  outputMode: SnippetOutputMode = "full",
): string {
  const component = `<baseline-status featureId="${featureId}"></baseline-status>`;

  if (outputMode === "component") {
    return component;
  }

  if (mode === "bundler") {
    return `import "baseline-status";

${component}`;
  }

  return `<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/baseline-status@1/baseline-status.min.js"
></script>
${component}`;
}
