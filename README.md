# ai

This repository now contains the current browser-only AI chat application and its supporting static build tooling.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/index.html`.

## Build

```bash
npm run build
```

Output is written to `dist/`. For the Puter-friendly variant:

```bash
npm run build:puter
```

## Test

```bash
npm test
```

Note: on Windows, the smoke test can fail with `EBUSY` if a file in `dist/` is locked by another process.
