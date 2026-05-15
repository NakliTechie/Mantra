# Mantra — Multi-provider LLM workbench

**Author prompts. Fan them out to Claude, GPT, Gemini, OpenRouter, Groq, Ollama, LM Studio, and local WebGPU models side-by-side. See streamed outputs with latency and cost. Keys never leave your browser.**

Single HTML file. No server. No build step. Open `index.html` or visit the hosted version.

[Live](https://mantra.naklitechie.com/) · part of the [NakliTechie](https://naklitechie.github.io/) browser-native series.

## What's here in v1

- **Prompt Studio** — paste a prompt with optional `{{variables}}`, pick providers, click Run, watch side-by-side streamed outputs with latency and cost-per-call.
- **Models & Keys** — per-provider key fields, "test" button against each provider's models endpoint, model matrix with pricing, rate-limit calculator.
- **Run history** — every run saved to OPFS, replay or fork from the History tab, export the whole archive to a folder via the File System API.
- **Local WebGPU models** — Gemma 3 1B, Qwen 2.5 0.5B, SmolLM2 1.7B running entirely in-browser via Transformers.js, compared head-to-head with frontier API models in the same fan-out.
- **JS API** — opt-in `window.mantra` surface (`runPrompt`, `getRuns`, `onRun`) plus cross-tab `postMessage` so other browser-native apps can push prompts into Mantra.

## What's coming

- **Wave 2 — Eval Bench**: datasets, assertions (exact / regex / JSON-schema / LLM-as-judge), pairwise compare, regression dashboards.
- **Wave 3 — RAG Lab**: chunker preview, embedding playground, retriever simulator, grounding checker, vector store browser.

Stateless calculators that pair with this workbench (token counter, cost estimator, jailbreak / injection / PII scanner) live in [BOFH](https://bofh.naklitechie.com/).

## Privacy

- **API keys** live in your browser's localStorage. No telemetry, no key relay.
- **Prompts** are sent directly from your browser to whichever provider you select. Mantra has no server in the middle.
- **Run history** lives in your browser's OPFS by default (private to this origin). Export to a folder you control via the History tab.

## Running locally

```bash
cd Mantra
python3 -m http.server 8080
# open http://localhost:8080
```

Or just open `index.html` in a modern browser. Anthropic / OpenAI / Gemini direct browser calls require recent browser versions; the Anthropic adapter sends `anthropic-dangerous-direct-browser-access: true`.

## Add a provider

Edit the `PROVIDERS` constant in `index.html`. Shape required:

```js
{
  id: 'myprov',
  label: 'My Provider',
  baseUrl: 'https://...',
  keyHeader: 'Authorization', keyPrefix: 'Bearer ',
  modelsUrl: 'https://.../v1/models',  // optional, for Test
  defaultModel: '...',
  knownModels: ['...'],
  shape: 'openai',  // or 'anthropic' / 'gemini'
}
```

If the provider speaks OpenAI's chat-completions schema (most do), `shape: 'openai'` works out of the box. Anthropic and Gemini have their own SSE shapes — see the `parseSSE*` functions.

## Conventions

This project follows the [NakliTechie single-file pattern](https://naklitechie.github.io/) — markup, styles, and logic in one HTML file. The CDN imports for Transformers.js use `@4/+esm` exactly (older versions crash with newer models). Workers are created via blob URLs with `type: 'module'`.

## License

MIT.
