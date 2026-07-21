# ai

This repository now contains the current browser-only AI chat application and its supporting static build tooling.

https://vsllm.com/i/9jLY

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/index.html`.

## Real terminal bridge

Canvas icindeki Terminal sekmesi artik yerel bir shell process'ine baglanir. Bunun icin ayri bir terminalde sunu calistirin:

```bash
npm run proxy
```

Bu komut hem LLM proxy'yi hem de `xterm.js` icin gereken yerel terminal bridge'ini `http://localhost:8787` uzerinde açar.

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
