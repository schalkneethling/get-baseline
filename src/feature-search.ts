export type BaselineValue = "high" | "low" | false;

export type FeatureRecord = {
  caniuse?: string[];
  compat_features?: string[];
  description?: string;
  group?: string[];
  kind?: "feature" | "moved" | "split";
  name?: string;
  redirect_target?: string;
  redirect_targets?: string[];
  status?: {
    baseline?: BaselineValue;
    baseline_high_date?: string;
    baseline_low_date?: string;
  };
};

export type FeatureMap = Record<string, FeatureRecord>;

export type FeatureEntry = {
  baseline: BaselineValue | "unknown";
  description: string;
  id: string;
  kind: FeatureRecord["kind"];
  name: string;
  redirectTarget?: string;
  redirectTargets: string[];
  searchText: string;
};

export type SearchResult = {
  entry: FeatureEntry;
  matchType: "direct" | "suggested";
  score: number;
};

export function createFeatureIndex(features: FeatureMap): FeatureEntry[] {
  return Object.entries(features).map(([id, feature]) => {
    const redirectTargets =
      feature.kind === "split"
        ? (feature.redirect_targets ?? [])
        : feature.redirect_target
          ? [feature.redirect_target]
          : [];
    const name = feature.name ?? readableFeatureId(id);
    const searchableParts = [
      id,
      name,
      feature.description,
      ...(feature.caniuse ?? []),
      ...(feature.compat_features ?? []),
      ...(feature.group ?? []),
      ...redirectTargets,
    ];

    return {
      baseline: feature.status?.baseline ?? "unknown",
      description: feature.description ?? redirectDescription(feature, id),
      id,
      kind: feature.kind ?? "feature",
      name,
      redirectTarget: feature.redirect_target,
      redirectTargets,
      searchText: searchableParts.filter(Boolean).join(" ").toLowerCase(),
    };
  });
}

export function searchFeatures(index: FeatureEntry[], rawQuery: string, limit = 5): SearchResult[] {
  const query = normalizeQuery(rawQuery);

  if (!query) {
    return [];
  }

  const direct = index.find((entry) => isDirectMatch(entry, query));

  if (direct) {
    return [{ entry: direct, matchType: "direct", score: Number.POSITIVE_INFINITY }];
  }

  return index
    .map((entry) => ({ entry, matchType: "suggested" as const, score: scoreEntry(entry, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit);
}

export function resolveFeature(entry: FeatureEntry, index: FeatureEntry[]): FeatureEntry {
  if (entry.kind !== "moved" || !entry.redirectTarget) {
    return entry;
  }

  return index.find((candidate) => candidate.id === entry.redirectTarget) ?? entry;
}

export function getBaselineLabel(entry: FeatureEntry): string {
  switch (entry.baseline) {
    case "high":
      return "Widely available";
    case "low":
      return "Newly available";
    case false:
      return "Limited availability";
    default:
      return "Status pending";
  }
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isDirectMatch(entry: FeatureEntry, query: string): boolean {
  const compactQuery = query.replaceAll(" ", "-");

  return (
    entry.id.toLowerCase() === query ||
    entry.id.toLowerCase() === compactQuery ||
    entry.name.toLowerCase() === query
  );
}

function scoreEntry(entry: FeatureEntry, query: string): number {
  const compactQuery = query.replaceAll(" ", "-");
  const normalizedId = entry.id.toLowerCase();
  const normalizedName = entry.name.toLowerCase();
  const terms = query.split(" ").filter(Boolean);
  let score = 0;

  if (normalizedId.startsWith(compactQuery)) score += 95;
  if (normalizedName.startsWith(query)) score += 90;
  if (normalizedId.includes(compactQuery)) score += 70;
  if (normalizedName.includes(query)) score += 65;
  if (entry.searchText.includes(query)) score += 30;
  if (entry.searchText.includes(compactQuery)) score += 25;

  for (const term of terms) {
    if (normalizedId.includes(term)) score += 12;
    if (normalizedName.includes(term)) score += 10;
    if (entry.searchText.includes(term)) score += 4;
  }

  return score;
}

function readableFeatureId(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function redirectDescription(feature: FeatureRecord, id: string): string {
  if (feature.kind === "moved" && feature.redirect_target) {
    return `${readableFeatureId(id)} moved to ${feature.redirect_target}.`;
  }

  if (feature.kind === "split" && feature.redirect_targets?.length) {
    return `${readableFeatureId(id)} split into ${feature.redirect_targets.join(", ")}.`;
  }

  return "Feature metadata is available from the Web Platform DX data set.";
}
