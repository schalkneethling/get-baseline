# Get Baseline

Get Baseline helps people find the right Web Platform DX feature ID and generate a copyable snippet for the Baseline status component.

## What It Does

- Searches the local `web-features` catalog by feature name, API, CSS property, or ID.
- Shows direct matches and nearby matches when the query is ambiguous.
- Previews the real `baseline-status` component.
- Generates CDN and bundler snippets for pasting into a project.

## Development

This project uses Vite+.

```sh
vp install
vp dev
vp check
vp test
vp build
```

The app entry point is `index.html`; dynamic behavior lives in `src/main.ts`.
