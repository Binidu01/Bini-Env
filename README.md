# bini-env

![npm](https://img.shields.io/npm/v/bini-env?color=cyan&style=flat-square)
![npm downloads](https://img.shields.io/npm/dm/bini-env?style=flat-square)
![license](https://img.shields.io/npm/l/bini-env?style=flat-square)
![vite](https://img.shields.io/badge/vite-%3E%3D8.0-646CFF?style=flat-square&logo=vite)
![hono](https://img.shields.io/badge/hono-%3E%3D4.0-E36002?style=flat-square&logo=hono)
![typescript](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square&logo=typescript)
![node](https://img.shields.io/badge/node-%3E%3D20.19-339933?style=flat-square&logo=node.js)

**Zero-config environment variable system + Vite plugin for Bini.js**  
Powered by [Hono](https://hono.dev) — reads env vars from the request context so variables are always resolved from the correct runtime binding, whether you're on Node.js, Bun, Deno, Vercel Edge, Netlify Edge, or Cloudflare Workers.

---

## ⚠️ Before You Use This

This library **does NOT magically make env vars safe**.

- Anything exposed to the client (`import.meta.env`) is **public**.
- Only server-side code (`getEnv`, `requireEnv`) can safely access secrets.
- Misconfigured prefixes = **data leak**.

If you don't understand this, stop and fix that first.

---

## ✨ Features

- **Hono-native API** — `getEnv(c, key)` / `requireEnv(c, key)` read from Hono's request context
- **Universal runtime support** — CF Workers, Node, Bun, Deno, Vercel Edge, Netlify Edge
- **Zero dotenv** — no `.env` file parsing at runtime; vars come from the host
- **Build-time `process.env` fallback** — for Vite plugin hooks that run outside a request
- **Auto server restart** — dev server restarts when `.env` files are created or changed
- **Prefix control** — supports `BINI_`, `VITE_`, or custom
- **Tree-shakeable** — no dead code in client bundles
- **Typed** — full TypeScript support with exported `HonoContext` duck type
- **Fast** — zero overhead; no file reads in production

---

## 📦 Installation

```bash
pnpm add bini-env hono
# or
npm install bini-env hono
# or
yarn add bini-env hono
```

> `hono` is a required peer dependency.

---

## 🚀 Quick Start

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { biniEnv } from 'bini-env'

export default defineConfig({
  plugins: [biniEnv()]
})
```

```ts
// src/app/api/example.ts
import { Hono } from 'hono'
import { getEnv, requireEnv } from 'bini-env'

const app = new Hono()

app.get('/hello', (c) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = c as any
  const name = getEnv(ctx, 'APP_NAME') ?? 'World'
  return c.json({ message: `Hello, ${name}!` })
})

export default app
```

---

## 🔐 Environment Rules (Read This Twice)

> ✅ Both `BINI_` and `VITE_` prefixes work out of the box — no extra config needed.

### Client (PUBLIC)

```env
BINI_PUBLIC_API_URL=https://api.example.com
VITE_ANALYTICS_ID=UA-XXXX
```

```ts
import.meta.env.BINI_PUBLIC_API_URL
```

👉 **Never put secrets here. Ever.**

### Server (PRIVATE)

```env
SMTP_PASS=super_secret
DATABASE_URL=postgres://...
```

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = c as any
const pass = requireEnv(ctx, 'SMTP_PASS')  // throws if missing
const db   = getEnv(ctx, 'DATABASE_URL')   // returns undefined if missing
```

👉 If this leaks, it's your fault, not the library's.

---

## 🌍 Platform Support

`getEnv` and `requireEnv` resolve vars from Hono's `env(c)` adapter, which maps to the correct source on every supported platform automatically.

| Platform             | Runtime       | Where vars come from                | How `env(c)` reads them      |
| -------------------- | ------------- | ----------------------------------- | ---------------------------- |
| Node.js              | Node          | System env / platform dashboard     | `process.env` ✅              |
| Bun                  | Bun           | System env / platform dashboard     | `process.env` ✅              |
| Vercel Edge          | V8 isolate    | Project settings → Environment Vars | `process.env` ✅              |
| Netlify Edge         | Deno          | Site settings → Environment Vars    | `Deno.env.get()` ✅           |
| Cloudflare Workers   | V8 isolate    | `wrangler.toml [vars]` / dashboard  | CF bindings via `c.env` ✅    |
| Deno Deploy          | Deno          | Project settings → Environment Vars | `Deno.env.get()` ✅           |

> **Cloudflare note:** Secrets added via `wrangler secret put` are only available inside the fetch handler via `c.env` — this is a Cloudflare Workers architecture constraint, not a bini-env limitation. `getEnv` reads them correctly when called with `c` inside a route handler.

---

## 🧠 How It Actually Works

`getEnv(c, key)` resolves in this order:

1. **`env(c)` from `hono/adapter`** — the Hono request context. This is the primary and correct source on every runtime. Never cached — request-scoped.
2. **Stored context** — if you called `setContext(c)` in a global middleware, `getEnv('KEY')` (no `c`) uses it.
3. **`process.env`** — build-time only, for Vite plugin hooks that run outside any request.

`dotenv` is not used anywhere. Variables must be set in your platform's environment config.

---

## 🔄 Auto Server Restart

The dev server automatically restarts when any `.env*` file is created or changed in your project root.

```
12:00:01 [bini-env] .env.local changed — restarting server
```

Covered events:
- Creating a new `.env`, `.env.local`, `.env.production`, etc.
- Editing any existing `.env*` file

Editor swap files (`.env.swp`, `.env~`, `.env.bak`) are ignored.

---

## ⚙️ Plugin Options

```ts
biniEnv({
  enabled        : true,
  clearViteHeader: true,
  logo           : 'ß',
  envPrefix      : ['BINI_', 'VITE_'],
  loadInPreview  : true,
})
```

> **Critical:** If you change `envPrefix`, you are changing what gets exposed to the browser. Break this → you leak secrets.

---

## 📚 API

### `getEnv(c, key)`

Returns `string | undefined`. Reads from Hono's request context.

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = c as any
const debug = getEnv(ctx, 'DEBUG_MODE')
```

Also works without `c` outside a request (build-time / Vite hooks):

```ts
const debug = getEnv('DEBUG_MODE')
```

### `requireEnv(c, key)`

Same as `getEnv` but throws if the variable is missing:

```
[bini-env] Missing required environment variable: "SMTP_PASS"
  → In development: set it in your platform's env config.
  → In production: set it in your hosting dashboard.
```

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = c as any
const dbUrl = requireEnv(ctx, 'DATABASE_URL')
```

### `setContext(c)` / `clearContext()`

Store a Hono context module-level so `getEnv('KEY')` works without passing `c` at every call site. Register once in a global middleware:

```ts
app.use('*', (c, next) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setContext(c as any)
  return next()
})
```

### `biniEnv(options)`

Vite plugin. Handles terminal output and dev server watching.

### `biniLogger`

Standalone logger that uses Vite-style terminal output. Available for use in your own Bini.js plugins.

```ts
import { biniLogger } from 'bini-env'

biniLogger.info('Server ready')
biniLogger.warn('Missing optional var')
biniLogger.error('Something broke', error)
```

### `HonoContext`

Exported duck type satisfied by any Hono `Context`. Use it if you need to type a wrapper:

```ts
import type { HonoContext } from 'bini-env'

function readConfig(c: HonoContext) {
  return getEnv(c, 'CONFIG_KEY')
}
```

---

## 📂 Env File Resolution Order (Dev only)

The Vite plugin watches these files and triggers a server restart on change:

1. `.env.local`
2. `.env.[mode].local`
3. `.env.[mode]`
4. `.env`

In production, none of these are read. Variables must come from your platform.

---

## ⚡ Performance

| Metric        | Dev      | Prod        |
| ------------- | -------- | ----------- |
| File Reads    | 0        | 0           |
| Runtime Cost  | ~0ms     | 0           |
| Bundle Impact | Minimal  | Tree-shaken |

No dotenv. No disk reads. No overhead.

---

## 🔥 Common Failure Modes

### "Env is undefined in production"
You relied on a `.env` file in production. Set vars in your hosting dashboard — bini-env does not read `.env` files at runtime.

### "Works in dev, broken in prod"
Same as above. Production vars come from the host, not from files.

### "Secrets leaked"
You exposed them via `BINI_` or `VITE_` prefix. Those are public. Use unprefixed vars for secrets and only read them server-side via `getEnv(c, key)`.

### "Cloudflare secret not found"
Secrets added via `wrangler secret put` are only available via `c.env` inside your handler — which is exactly where `getEnv(c, key)` reads from. Make sure you're passing `c`.

### "TypeScript error: Context not assignable to HonoContext"
Hono 4.12 added a `[GET_MATCH_RESULT]` symbol to `HonoRequest` that breaks structural assignability. Cast once per handler:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = c as any
const key = requireEnv(ctx, 'MY_KEY')
```

### "Types not found"
Add to your `tsconfig` or entry file:
```ts
/// <reference types="vite/client" />
```

---

## 🧪 Reality Check

This library is intentionally simple.

If you need:
- Secret rotation
- Encrypted envs
- Runtime validation schemas

That's **your job**, not this package.

---

## 🤝 Contributing

PRs welcome — but:
- No bloat
- No magic
- No runtime cost

If it slows startup or increases bundle size, it's getting rejected.

---

## 📄 License

MIT © Bini.js Team

---

**Ship fast. Leak nothing. Blame config, not tooling.**