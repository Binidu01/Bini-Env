# bini-env

![npm](https://img.shields.io/npm/v/bini-env?color=cyan&style=flat-square)
![npm downloads](https://img.shields.io/npm/dm/bini-env?style=flat-square)
![license](https://img.shields.io/npm/l/bini-env?style=flat-square)
![vite](https://img.shields.io/badge/vite-8.x-646CFF?style=flat-square&logo=vite)
![hono](https://img.shields.io/badge/hono-4.x-E36002?style=flat-square&logo=hono)
![typescript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)
![node](https://img.shields.io/badge/node-%3E%3D20.19-339933?style=flat-square&logo=node.js)

**Environment variable system + Vite plugin for Bini.js**

Powered by [Hono](https://hono.dev) — reads env vars from the Hono request context so variables are always resolved from the correct runtime binding, whether you're on Node.js, Bun, Deno, Vercel Edge, Netlify Edge, or Cloudflare Workers.

---

## Features

- **Hono-native** — `getEnv(c, key)` / `requireEnv(c, key)` read directly from the Hono request context
- **Universal runtime** — CF Workers, Node, Bun, Deno, Vercel Edge, Netlify Edge — Hono's adapter handles all of it
- **Zero dotenv** — no `.env` parsing at runtime; vars come from the host platform
- **Vite-native dev** — `.env` loading, file watching, and server restarts are handled by Vite itself
- **Dev banner** — prints `ß Bini.js (dev/preview)` and lists detected `.env` files on server start
- **Prefix control** — `BINI_` and `VITE_` included out of the box, extend with your own
- **Tree-shakeable** — nothing lands in the client bundle that shouldn't
- **Typed** — full TypeScript support with an exported `HonoContext` type

---

## Installation

```bash
pnpm add bini-env hono
# or
npm install bini-env hono
# or
yarn add bini-env hono
```

> `hono` is a required peer dependency.

---

## Quick Start

**1. Register the Vite plugin**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { biniEnv } from 'bini-env'

export default defineConfig({
  plugins: [biniEnv()]
})
```

**2. Read env vars in your Hono handlers**

```ts
// src/app/api/hello.ts
import { Hono } from 'hono'
import { getEnv, requireEnv } from 'bini-env'

const app = new Hono()

app.post('/hello', async (c) => {
  try {
    const ctx = c as any

    // requireEnv throws if the var is missing — fail fast on required config
    const apiKey  = requireEnv(ctx, 'MY_API_KEY')

    // getEnv returns undefined if missing — use ?? to provide a default
    const appName = getEnv(ctx, 'APP_NAME')     ?? 'World'
    const timeout = parseInt(getEnv(ctx, 'TIMEOUT_MS') ?? '5000')

    return c.json({ message: `Hello, ${appName}!` })

  } catch (error: any) {
    if (error.message?.includes('[bini-env] Missing required')) {
      return c.json({ error: error.message }, 500)
    }
    return c.json({ error: 'Something went wrong.' }, 500)
  }
})

export default app
```

---

## Usage Pattern

**Always pass `c` explicitly.** Cast it once at the top of the handler, then use `ctx` throughout.

```ts
app.post('/example', async (c) => {
  try {
    const ctx = c as any

    // Required vars — handler throws immediately if missing
    const dbUrl  = requireEnv(ctx, 'DATABASE_URL')
    const apiKey = requireEnv(ctx, 'STRIPE_SECRET_KEY')

    // Optional vars — fall back to sensible defaults
    const model      = getEnv(ctx, 'AI_MODEL')    ?? 'gpt-4o'
    const region     = getEnv(ctx, 'AWS_REGION')  ?? 'us-east-1'
    const maxRetries = parseInt(getEnv(ctx, 'MAX_RETRIES') ?? '3')
    const debug      = getEnv(ctx, 'DEBUG_MODE')  === 'true'

    // ... rest of handler

  } catch (error: any) {
    if (error.message?.includes('[bini-env] Missing required')) {
      return c.json({ error: error.message }, 500)
    }
    return c.json({ error: 'Something went wrong.' }, 500)
  }
})
```

**The pattern in three steps:**

1. `const ctx = c as any` — once, at the top of the handler
2. `requireEnv(ctx, 'KEY')` — for vars the handler cannot run without
3. `getEnv(ctx, 'KEY') ?? 'default'` — for optional vars with sensible defaults

---

## Environment Prefixes

### The Truth About Prefixes

**Both `BINI_` and `VITE_` work exactly the same way.** Neither is special.

| Prefix | Exposed to Browser? | Default Behavior |
|--------|--------------------|------------------|
| `BINI_` | **Yes** | Included in `envPrefix` by default |
| `VITE_` | **Yes** | Vite's default prefix (always included) |
| Any prefix you add | **Yes** | If you add it to `envPrefix` |
| No prefix | **No** | Not exposed to browser |

### What `biniEnv()` Actually Does

```ts
// biniEnv() sets envPrefix to:
envPrefix: ['BINI_', 'VITE_']

// This tells Vite: "Expose ALL variables starting with BINI_ or VITE_ to import.meta.env"
```

**This means:**
- ✅ `BINI_API_KEY` → available in browser via `import.meta.env.BINI_API_KEY`
- ✅ `VITE_API_URL` → available in browser via `import.meta.env.VITE_API_URL`
- ❌ `DATABASE_URL` → NOT available in browser (no prefix)

### How to Keep Secrets Secret

**Use no prefix for secrets:**

```env
# ✅ NOT exposed to browser
DATABASE_URL=postgres://...
STRIPE_SECRET_KEY=sk_live_...
AWS_SECRET_KEY=...
```

**If you want `BINI_` to be private, remove it from `envPrefix`:**

```ts
// vite.config.ts
biniEnv({ envPrefix: ['VITE_'] }) // Only VITE_ exposed
// BINI_ is no longer exposed to the browser
```

### Choosing the Right Prefix

Since `BINI_` and `VITE_` are both exposed by default:

```env
# ✅ Use no prefix for secrets
DATABASE_URL=postgres://...
STRIPE_SECRET_KEY=sk_live_...

# ✅ Use any prefix for public config
BINI_API_URL=https://api.example.com
VITE_ANALYTICS_ID=UA-XXXX
PUBLIC_APP_NAME=MyApp  # If you add PUBLIC_ to envPrefix
```

### Prefix Summary

| Prefix | Exposed to Browser? | Use For |
|--------|--------------------|---------|
| No prefix | ❌ Never | **SECRETS** — API keys, database URLs, tokens |
| `BINI_` | ✅ Yes (by default) | Public config (same as VITE_) |
| `VITE_` | ✅ Yes (always) | Public config (Vite's default) |
| Custom prefix | ✅ If in `envPrefix` | Public config you want to control |

---

## Platform Support

`getEnv` and `requireEnv` delegate to Hono's `env(c)` adapter, which reads from the correct source on every supported platform automatically. Your code never changes regardless of where it deploys.

| Platform | Runtime | Env source | How Hono reads it |
|----------|---------|------------|-------------------|
| Node.js | Node | System env / platform dashboard | `process.env` ✅ |
| Bun | Bun | System env / platform dashboard | `process.env` ✅ |
| Vercel Edge | V8 isolate | Project settings → Env Vars | `process.env` ✅ |
| Netlify Edge | Deno | Site settings → Env Vars | `Deno.env.get()` ✅ |
| Cloudflare Workers | V8 isolate | `wrangler.toml` / dashboard | CF bindings via `c.env` ✅ |
| Deno Deploy | Deno | Project settings → Env Vars | `Deno.env.get()` ✅ |

> **Cloudflare note:** Secrets set via `wrangler secret put` are only available inside the fetch handler via `c.env` — this is a Workers architecture constraint. `getEnv(ctx, key)` reads them correctly as long as you pass `c`.

---

## How It Works

### The plugin — `biniEnv()`

Does two things: tells Vite which env prefixes to expose to `import.meta.env`, and prints the `ß Bini.js` banner with detected `.env` files when the dev or preview server starts.

```ts
// what biniEnv() does internally
config() {
  return { envPrefix: ['BINI_', 'VITE_', ...yourExtras] }
}
```

On server start you will see:

```
  ß Bini.js (dev)
  ➜  Environments: .env.local, .env
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.7:3000/
```

Vite handles everything else natively: loading `.env`, `.env.local`, `.env.[mode]` files during dev, watching and restarting on change, injecting prefixed vars into `import.meta.env` at build time, and HMR when env files change. bini-env does not reimplement any of that.

### The env functions — `getEnv` / `requireEnv`

Both functions read exclusively from `env(c)` via `hono/adapter` — the Hono request context. There are no `process.env` fallbacks. Every read is request-scoped and resolved by Hono's adapter for the current platform.

`dotenv` is never used. In production, vars are set in your hosting platform's environment config.

---

## API Reference

### `getEnv(c, key)`

Returns `string | undefined`. Reads from the Hono request context.

```ts
app.get('/config', async (c) => {
  const ctx = c as any

  const region   = getEnv(ctx, 'AWS_REGION') ?? 'us-east-1'
  const logLevel = getEnv(ctx, 'LOG_LEVEL')  ?? 'info'
  const debug    = getEnv(ctx, 'DEBUG_MODE') === 'true'

  return c.json({ region, logLevel, debug })
})
```

### `requireEnv(c, key)`

Returns `string`. Throws immediately if the variable is missing or empty. Logs a descriptive error to the terminal on failure.

```ts
app.post('/send-email', async (c) => {
  try {
    const ctx = c as any

    const smtpHost = requireEnv(ctx, 'SMTP_HOST')
    const smtpPass = requireEnv(ctx, 'SMTP_PASS')
    const smtpPort = parseInt(getEnv(ctx, 'SMTP_PORT') ?? '587')

    // ... send email

    return c.json({ sent: true })

  } catch (error: any) {
    if (error.message?.includes('[bini-env] Missing required')) {
      return c.json({ error: error.message }, 500)
    }
    return c.json({ error: 'Failed to send email.' }, 500)
  }
})
```

On failure, the terminal will show:

```
[bini-env] error  Missing required environment variable: "SMTP_HOST"
  -> Set it in your platform's env config or hosting dashboard.
```

### `biniEnv(options?)`

Vite plugin. Registers `BINI_` and `VITE_` as env prefixes and optionally adds more.

```ts
biniEnv()
// or with extra prefixes
biniEnv({ envPrefix: ['MY_PUBLIC_'] })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `envPrefix` | `string \| string[]` | `[]` | Extra prefixes to expose to `import.meta.env`, in addition to `BINI_` and `VITE_` |

### `biniLogger`

Vite-style terminal logger. Use it in your own Bini.js plugins or server-side code.

```ts
import { biniLogger } from 'bini-env'

biniLogger.info('Server ready')
biniLogger.warn('Missing optional var')
biniLogger.error('Something broke', error)
```

### `HonoContext`

Exported type (`Context` from Hono). Use it to type helper functions that group env reads, so you only cast `c as any` once per entry point.

```ts
import type { HonoContext } from 'bini-env'

function readDbConfig(c: HonoContext) {
  const ctx = c as any
  return {
    url:      requireEnv(ctx, 'DATABASE_URL'),
    poolSize: parseInt(getEnv(ctx, 'DB_POOL_SIZE') ?? '10'),
    ssl:      getEnv(ctx, 'DB_SSL') !== 'false',
  }
}
```

---

## Security Best Practices

### Rule 1: Never Prefix Secrets
```env
# ❌ BAD - This will be exposed to the browser!
BINI_DATABASE_URL=postgres://...

# ✅ GOOD - Not exposed to browser
DATABASE_URL=postgres://...
```

### Rule 2: Use No Prefix for Anything Secret
```env
# ✅ Safe - Not exposed
DATABASE_URL=postgres://...
STRIPE_SECRET=sk_live_...
AWS_SECRET_KEY=...
```

### Rule 3: Use Any Prefix for Public Data
```env
# ✅ Safe - Public data
BINI_API_URL=https://api.example.com
VITE_GA_ID=UA-XXXXX
PUBLIC_APP_NAME=MyApp
```

### Rule 4: Remove `BINI_` from envPrefix if You Want It Private
```ts
// To make BINI_ private, remove it from envPrefix
biniEnv({ envPrefix: ['VITE_'] })
```

---

## Performance

| Metric | Dev | Prod |
|--------|-----|------|
| File reads | 0 | 0 |
| Runtime cost | ~0ms | 0 |
| Bundle impact | Minimal | Tree-shaken |

No dotenv. No disk reads. No caching layer. `getEnv` is a direct call to Hono's adapter on every invocation — request-scoped and correct.

---

## Troubleshooting

### "My BINI_ var is exposed to the browser!"

Yes — by design. `BINI_` is included in `envPrefix` by default. Use no prefix for secrets.

### "Env var is undefined in production"

Vars set in `.env` files are only loaded by Vite during local development. In production, set your variables in your hosting platform's environment dashboard (Vercel, Netlify, Cloudflare, etc.).

### "Works in dev, undefined in prod"

Same as above. Local dev works because Vite loads `.env` files automatically. Production requires platform-level configuration.

### "Cloudflare secret not found"

Secrets set via `wrangler secret put` are only available via `c.env` inside a handler — which is exactly what `getEnv(ctx, key)` reads. Ensure you are passing `c` to the function.

### "TypeScript error: Context not assignable to HonoContext"

Hono 4.12+ added a symbol to `HonoRequest` that can break structural assignability in strict TypeScript projects. Cast once per handler:

```ts
const ctx = c as any
```

### "Types not found"

Add to your `tsconfig.json` or entry file:

```ts
/// <reference types="vite/client" />
```

---

## Compatibility

| Tool | Version | Notes |
|------|---------|-------|
| Vite | 8.x | `envPrefix` hook is fully compatible; empty prefix array is never passed |
| Hono | 4.x | `hono/adapter` `env()` is stable across all 4.x releases |
| TypeScript | 5.x | Full type support via exported `HonoContext` |
| Node.js | ≥ 20.19 | Minimum required version |

---

## Contributing

PRs are welcome. The goal of this library is to stay minimal and runtime-cost-free. Contributions that add unnecessary complexity, increase bundle size, or introduce startup overhead will not be accepted.

---

## License

MIT © Bini.js Team
