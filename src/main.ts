import "baseline-status";
import { Copy, createElement } from "lucide";
import webFeaturesData from "web-features/data.json" with { type: "json" };
import {
  createFeatureIndex,
  getBaselineLabel,
  resolveFeature,
  searchFeatures,
  type FeatureEntry,
  type FeatureMap,
  type SearchResult,
} from "./feature-search.ts";
import { createSnippet, type SnippetMode, type SnippetOutputMode } from "./snippets.ts";

type AppState = {
  copyState: "idle" | "copied" | "failed";
  idCopyState: "idle" | "copied" | "failed";
  results: SearchResult[];
  selected: FeatureEntry;
  snippetOutputMode: SnippetOutputMode;
  snippetMode: SnippetMode;
};

type CustomHighlight = {
  add(range: Range): void;
};

type CustomHighlightConstructor = new (...ranges: Range[]) => CustomHighlight;

type CssWithHighlights = typeof CSS & {
  highlights?: Map<string, CustomHighlight>;
};

type WindowWithHighlight = Window & {
  Highlight?: CustomHighlightConstructor;
};

type SnippetHighlightName =
  | "snippet-attribute"
  | "snippet-keyword"
  | "snippet-string"
  | "snippet-tag";

type SnippetToken = {
  end: number;
  name: SnippetHighlightName;
  start: number;
};

const COPY_RESET_DELAY_MS = 3000;
const SNIPPET_HIGHLIGHT_NAMES: SnippetHighlightName[] = [
  "snippet-attribute",
  "snippet-keyword",
  "snippet-string",
  "snippet-tag",
];
const SNIPPET_FALLBACK_CLASSES: Record<SnippetHighlightName, string> = {
  "snippet-attribute": "syntax-token-attribute",
  "snippet-keyword": "syntax-token-keyword",
  "snippet-string": "syntax-token-string",
  "snippet-tag": "syntax-token-tag",
};
const SNIPPET_HIGHLIGHT_STYLE_ID = "snippet-highlight-styles";
const SNIPPET_HIGHLIGHT_CSS = `
::highlight(snippet-attribute) {
  color: var(--syntax-attribute);
}

::highlight(snippet-keyword) {
  color: var(--syntax-keyword);
}

::highlight(snippet-string) {
  color: var(--syntax-string);
}

::highlight(snippet-tag) {
  color: var(--syntax-tag);
}
`;

const featureIndex = createFeatureIndex(webFeaturesData.features as FeatureMap);
const defaultFeature =
  featureIndex.find((entry) => entry.id === "anchor-positioning") ?? featureIndex[0];

if (!defaultFeature) {
  throw new Error("The generator could not initialize.");
}

let copyResetController: AbortController | undefined;
let idCopyResetController: AbortController | undefined;
let redirectListenersController = new AbortController();
let resultListenersController = new AbortController();

const elements = {
  copyFeatureIdButton: requiredElement<HTMLButtonElement>("#copy-feature-id"),
  copyButton: requiredElement<HTMLButtonElement>("#copy-snippet"),
  description: requiredElement<HTMLParagraphElement>("#feature-description"),
  form: requiredElement<HTMLFormElement>(".search-form"),
  id: requiredElement<HTMLElement>("#feature-id"),
  input: requiredElement<HTMLInputElement>("#feature-query"),
  name: requiredElement<HTMLHeadingElement>("#feature-name"),
  preview: requiredElement<HTMLElement>("#feature-preview"),
  redirectNote: requiredElement<HTMLElement>("#redirect-note"),
  redirectTargets: requiredElement<HTMLElement>("#redirect-targets"),
  resultsHeading: requiredElement<HTMLParagraphElement>("#results-heading"),
  resultsList: requiredElement<HTMLUListElement>("#results-list"),
  resultsMessage: requiredElement<HTMLParagraphElement>("#results-message"),
  snippetCode: requiredElement<HTMLElement>("#snippet-code"),
  sourceSwitch: requiredElement<HTMLButtonElement>("#source-switch"),
};

const state: AppState = {
  copyState: "idle",
  idCopyState: "idle",
  results: [],
  selected: resolveFeature(defaultFeature, featureIndex),
  snippetOutputMode: "component",
  snippetMode: "cdn",
};

mountCopyIcon(elements.copyFeatureIdButton);
mountSnippetHighlightStyles();
renderSelectedFeature();
bindEvents();

function bindEvents() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(elements.input.value);
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;

      if (mode !== "cdn" && mode !== "bundler") return;

      state.snippetMode = mode;
      resetCopyState();
      renderSelectedFeature();
    });
  }

  elements.sourceSwitch.addEventListener("click", () => {
    toggleSnippetOutputMode();
  });

  elements.sourceSwitch.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Spacebar") return;

    event.preventDefault();
    toggleSnippetOutputMode();
  });

  elements.copyButton.addEventListener("click", async () => {
    const snippet = createSnippet(
      resolveFeature(state.selected, featureIndex).id,
      state.snippetMode,
      state.snippetOutputMode,
    );

    try {
      await navigator.clipboard.writeText(snippet);
      state.copyState = "copied";
      renderCopyButton();
      scheduleCopyStateReset();
    } catch {
      cancelCopyStateReset();
      state.copyState = "failed";
      selectSnippetText();
      renderCopyButton();
    }
  });

  elements.copyFeatureIdButton.addEventListener("click", async () => {
    const featureId = resolveFeature(state.selected, featureIndex).id;

    try {
      await navigator.clipboard.writeText(featureId);
      state.idCopyState = "copied";
      renderFeatureIdCopyButton();
      scheduleFeatureIdCopyStateReset();
    } catch {
      cancelFeatureIdCopyStateReset();
      state.idCopyState = "failed";
      renderFeatureIdCopyButton();
    }
  });
}

function runSearch(query: string) {
  state.results = searchFeatures(featureIndex, query);

  if (state.results.length === 1 && state.results[0]?.matchType === "direct") {
    state.selected = resolveFeature(state.results[0].entry, featureIndex);
  }

  resetAllCopyStates();
  renderResults(query);
  renderSelectedFeature();
}

function renderResults(query: string) {
  resetResultListeners();
  elements.resultsList.replaceChildren();

  if (!query.trim()) {
    elements.resultsMessage.hidden = false;
    elements.resultsMessage.textContent =
      "Start with a feature name, CSS property, JavaScript API, or known web-features ID.";
    elements.resultsHeading.hidden = true;
    return;
  }

  if (state.results.length === 0) {
    elements.resultsMessage.hidden = false;
    elements.resultsMessage.textContent =
      'No match found. Try a broader feature name, such as "popover" or "container".';
    elements.resultsHeading.hidden = true;
    return;
  }

  elements.resultsMessage.hidden = true;
  elements.resultsHeading.hidden = false;
  elements.resultsHeading.textContent =
    state.results[0]?.matchType === "direct" ? "Direct match" : "Possible matches";

  for (const result of state.results) {
    elements.resultsList.append(createResultItem(result, resultListenersController.signal));
  }
}

function createResultItem(result: SearchResult, signal: AbortSignal): HTMLLIElement {
  const entry = result.entry;
  const resolved = resolveFeature(entry, featureIndex);
  const item = document.createElement("li");
  const button = document.createElement("button");
  const text = document.createElement("span");
  const name = document.createElement("strong");
  const id = document.createElement("code");
  const status = document.createElement("small");
  const redirectText =
    entry.kind === "moved" && entry.redirectTarget ? `Moved to ${entry.redirectTarget}` : "";
  const splitText =
    entry.kind === "split" && entry.redirectTargets.length
      ? `Split into ${entry.redirectTargets.join(", ")}`
      : "";

  button.type = "button";
  name.textContent = resolved.name;
  id.textContent = resolved.id;
  status.textContent = redirectText || splitText || getBaselineLabel(resolved);

  text.append(name, id);
  button.append(text, status);
  button.addEventListener(
    "click",
    () => {
      state.selected = resolved;
      state.results = [];
      resetAllCopyStates();
      elements.input.value = resolved.name;
      elements.resultsList.replaceChildren();
      elements.resultsHeading.hidden = true;
      elements.resultsMessage.hidden = false;
      elements.resultsMessage.textContent = "Search again to compare another feature.";
      renderSelectedFeature();
    },
    { signal },
  );

  item.append(button);
  return item;
}

function renderSelectedFeature() {
  const resolvedSelection = resolveFeature(state.selected, featureIndex);

  elements.name.textContent = resolvedSelection.name;
  elements.id.textContent = resolvedSelection.id;
  elements.description.textContent = resolvedSelection.description;
  elements.preview.setAttribute("featureId", resolvedSelection.id);
  const snippet = createSnippet(resolvedSelection.id, state.snippetMode, state.snippetOutputMode);
  renderSnippet(snippet);

  renderRedirectTargets(state.selected.kind === "split" ? state.selected.redirectTargets : []);
  renderModeButtons();
  renderSourceSwitch();
  renderCopyButton();
  renderFeatureIdCopyButton();
}

function renderSnippet(snippet: string) {
  clearSnippetHighlights();

  if (!isSnippetHighlightSupported()) {
    renderSnippetFallback(snippet);
    return;
  }

  elements.snippetCode.textContent = snippet;
  renderSnippetHighlights(snippet);
}

function clearSnippetHighlights() {
  const css = CSS as CssWithHighlights;

  for (const name of SNIPPET_HIGHLIGHT_NAMES) {
    css.highlights?.delete(name);
  }
}

function isSnippetHighlightSupported() {
  return Boolean(
    (CSS as CssWithHighlights).highlights && (window as WindowWithHighlight).Highlight,
  );
}

function renderSnippetHighlights(snippet: string) {
  const css = CSS as CssWithHighlights;
  const HighlightConstructor = (window as WindowWithHighlight).Highlight;

  if (!css.highlights || !HighlightConstructor) return;

  const textNode = elements.snippetCode.firstChild;

  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

  const rangesByName = new Map<SnippetHighlightName, Range[]>();

  for (const token of getSnippetTokens(snippet)) {
    const range = document.createRange();
    range.setStart(textNode, token.start);
    range.setEnd(textNode, token.end);

    const ranges = rangesByName.get(token.name) ?? [];
    ranges.push(range);
    rangesByName.set(token.name, ranges);
  }

  for (const [name, ranges] of rangesByName) {
    if (ranges.length > 0) {
      css.highlights.set(name, new HighlightConstructor(...ranges));
    }
  }
}

function renderSnippetFallback(snippet: string) {
  const fragment = document.createDocumentFragment();
  const tokens = getSnippetTokens(snippet).sort((a, b) => a.start - b.start || a.end - b.end);
  let position = 0;

  for (const token of tokens) {
    if (token.start < position) continue;

    fragment.append(document.createTextNode(snippet.slice(position, token.start)));

    const tokenElement = document.createElement("span");
    tokenElement.classList.add("syntax-token", SNIPPET_FALLBACK_CLASSES[token.name]);
    tokenElement.textContent = snippet.slice(token.start, token.end);
    fragment.append(tokenElement);

    position = token.end;
  }

  fragment.append(document.createTextNode(snippet.slice(position)));
  elements.snippetCode.replaceChildren(fragment);
}

function mountSnippetHighlightStyles() {
  if (document.getElementById(SNIPPET_HIGHLIGHT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = SNIPPET_HIGHLIGHT_STYLE_ID;
  style.textContent = SNIPPET_HIGHLIGHT_CSS;
  document.head.append(style);
}

function getSnippetTokens(snippet: string): SnippetToken[] {
  return [
    ...getRegexTokens(snippet, /\bimport\b/g, "snippet-keyword"),
    ...getRegexTokens(snippet, /"[^"]*"/g, "snippet-string"),
    ...getRegexTokens(snippet, /\b(?:featureId|src|type)(?==)/g, "snippet-attribute"),
    ...getTagNameTokens(snippet),
  ];
}

function getRegexTokens(
  snippet: string,
  pattern: RegExp,
  name: SnippetHighlightName,
): SnippetToken[] {
  return Array.from(snippet.matchAll(pattern), (match) => ({
    end: match.index + match[0].length,
    name,
    start: match.index,
  }));
}

function getTagNameTokens(snippet: string): SnippetToken[] {
  return Array.from(snippet.matchAll(/<\/?([a-z][\w-]*)/g), (match) => {
    const tagName = match[1];
    const start = match.index + match[0].length - tagName.length;

    return {
      end: start + tagName.length,
      name: "snippet-tag",
      start,
    };
  });
}

function renderRedirectTargets(splitTargets: string[]) {
  resetRedirectListeners();
  elements.redirectTargets.replaceChildren();
  elements.redirectNote.hidden = splitTargets.length === 0;

  for (const target of splitTargets) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = target;
    button.addEventListener(
      "click",
      () => {
        const selected = featureIndex.find((entry) => entry.id === target);

        if (!selected) return;

        state.selected = selected;
        resetAllCopyStates();
        renderSelectedFeature();
      },
      { signal: redirectListenersController.signal },
    );
    elements.redirectTargets.append(button);
  }
}

function renderModeButtons() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.classList.toggle("is-active", button.dataset.mode === state.snippetMode);
  }
}

function toggleSnippetOutputMode() {
  state.snippetOutputMode = state.snippetOutputMode === "full" ? "component" : "full";
  resetCopyState();
  renderSelectedFeature();
}

function renderSourceSwitch() {
  const isFullSource = state.snippetOutputMode === "full";

  elements.sourceSwitch.setAttribute("aria-checked", String(isFullSource));

  for (const label of document.querySelectorAll<HTMLElement>("[data-source-mode]")) {
    label.classList.toggle("is-active", label.dataset.sourceMode === state.snippetOutputMode);
  }
}

function renderCopyButton() {
  switch (state.copyState) {
    case "copied":
      elements.copyButton.textContent = "Copied";
      break;
    case "failed":
      elements.copyButton.textContent = "Select code";
      break;
    default:
      elements.copyButton.textContent = "Copy snippet";
      break;
  }
}

function renderFeatureIdCopyButton() {
  const label = elements.copyFeatureIdButton.querySelector(".visually-hidden");

  switch (state.idCopyState) {
    case "copied":
      elements.copyFeatureIdButton.dataset.state = "copied";
      if (label) label.textContent = "Feature ID copied";
      break;
    case "failed":
      elements.copyFeatureIdButton.dataset.state = "failed";
      if (label) label.textContent = "Could not copy feature ID";
      break;
    default:
      elements.copyFeatureIdButton.dataset.state = "idle";
      if (label) label.textContent = "Copy feature ID";
      break;
  }
}

function resetAllCopyStates() {
  resetCopyState();
  resetFeatureIdCopyState();
}

function resetCopyState() {
  cancelCopyStateReset();
  state.copyState = "idle";
}

function resetFeatureIdCopyState() {
  cancelFeatureIdCopyStateReset();
  state.idCopyState = "idle";
}

function scheduleCopyStateReset() {
  cancelCopyStateReset();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    if (controller.signal.aborted) return;

    state.copyState = "idle";
    copyResetController = undefined;
    renderCopyButton();
  }, COPY_RESET_DELAY_MS);

  controller.signal.addEventListener("abort", () => window.clearTimeout(timeoutId), {
    once: true,
  });
  copyResetController = controller;
}

function cancelCopyStateReset() {
  copyResetController?.abort();
  copyResetController = undefined;
}

function scheduleFeatureIdCopyStateReset() {
  cancelFeatureIdCopyStateReset();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    if (controller.signal.aborted) return;

    state.idCopyState = "idle";
    idCopyResetController = undefined;
    renderFeatureIdCopyButton();
  }, COPY_RESET_DELAY_MS);

  controller.signal.addEventListener("abort", () => window.clearTimeout(timeoutId), {
    once: true,
  });
  idCopyResetController = controller;
}

function cancelFeatureIdCopyStateReset() {
  idCopyResetController?.abort();
  idCopyResetController = undefined;
}

function resetRedirectListeners() {
  redirectListenersController.abort();
  redirectListenersController = new AbortController();
}

function resetResultListeners() {
  resultListenersController.abort();
  resultListenersController = new AbortController();
}

function selectSnippetText() {
  const snippet = elements.snippetCode.closest("pre");

  if (!snippet) return;

  const range = document.createRange();
  range.selectNodeContents(snippet);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function mountCopyIcon(button: HTMLButtonElement) {
  const icon = createElement(Copy, {
    "aria-hidden": "true",
    class: "icon-button-icon",
    height: 18,
    width: 18,
  });

  button.prepend(icon);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}
