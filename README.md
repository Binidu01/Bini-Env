# bini-env

![npm](https://img.shields.io/npm/v/bini-env?color=cyan&style=flat-square)
![npm downloads](https://img.shields.io/npm/dm/bini-env?style=flat-square)
![license](https://img.shields.io/npm/l/bini-env?style=flat-square)
![vite](https://img.shields.io/badge/vite-%3E%3D8.0-646CFF?style=flat-square&logo=vite)
![typescript](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square&logo=typescript)
![node](https://img.shields.io/badge/node-%3E%3D20.19-339933?style=flat-square&logo=node.js)

**Zero-config environment variable system + Vite plugin for Bini.js**  
Loads `.env` in development, uses host-provided variables in production, and works across Node.js, Bun, Deno, Vercel Edge, Netlify Edge, and Cloudflare Workers — without leaking secrets or adding runtime cost.

---

## ⚠️ Before You Use This

This library **does NOT magically make env vars safe**.

- Anything exposed to the client (`import.meta.env`) is **public**.
- Only server-side code (`getEnv`, `requireEnv`) can safely access secrets.
- Misconfigured prefixes = **data leak**.

If you don't understand this, stop and fix that first.

---

## ✨ Features

- **Universal API** — `getEnv()` / `requireEnv()` work across all runtimes
- **Zero-config `.env` loading** in development
- **Edge-safe** — no static `fs`, `path`, or `dotenv` imports in bundles
- **Auto server restart** — dev server restarts when `.env` files are created or changed
- **Strict production behavior** — no file reads, no dotenv
- **Prefix control** — supports `BINI_`, `VITE_`, or custom
- **Tree-shakeable** — no dead code in client bundles
- **Typed** — full TypeScript support
- **Fast** — single load in dev, zero overhead in prod

---

## 📦 Installation

```bash
pnpm add bini-env
# or
npm install bini-env
# or
yarn add bini-env
```

---

## 🚀 Quick Start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { biniEnv } from 'bini-env';

export default defineConfig({
  plugins: [biniEnv()]
});
```

Done. If this doesn't work, your project setup is broken — not the plugin.

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
// getEnv and requireEnv are auto-imported in API routes
const pass = requireEnv('SMTP_PASS');  // throws if missing
const db   = getEnv('DATABASE_URL');   // returns undefined if missing
```

👉 If this leaks, it's your fault, not the library's.

---

## 🌍 Platform Support

`getEnv` and `requireEnv` work identically across every supported platform. Write your API routes once — they run everywhere unchanged.

| Platform           | Runtime       | Where vars come from                  | How `getEnv` reads them |
| ------------------ | ------------- | ------------------------------------- | ----------------------- |
| Node.js            | Node          | `.env` file / system env              | `process.env` ✅         |
| Bun                | Bun           | `.env` file / system env              | `process.env` ✅         |
| Vercel Edge        | V8 isolate    | Project settings → Environment Vars   | `process.env` ✅         |
| Netlify Edge       | Deno          | Site settings → Environment Vars      | `Deno.env.get()` ✅      |
| Cloudflare Workers | V8 isolate    | `wrangler.toml [vars]` / dashboard    | `process.env` ✅         |
| Deno Deploy        | Deno          | Project settings → Environment Vars   | `Deno.env.get()` ✅      |

> **Cloudflare note:** Variables set in `wrangler.toml [vars]` or the dashboard work with `getEnv` at the top level. Secrets added via `wrangler secret put` are only available inside the fetch handler via `c.env` — this is a Cloudflare Workers architecture constraint, not a bini-env limitation.

---

## 🧠 How It Actually Works

| Mode             | Behavior                                          |
| ---------------- | ------------------------------------------------- |
| Dev (`vite dev`) | Loads `.env` once via dynamic dotenv              |
| Preview          | Same as dev                                       |
| Production       | Uses `process.env` / host injection only          |
| Deno / Netlify Edge | Uses native `Deno.env`                         |
| Vercel / Cloudflare Edge | Uses `process.env` injected by the host  |

`fs`, `path`, and `dotenv` are **never imported at the top level**. They are dynamically imported at runtime, inside Node-only guards, so edge bundlers never trace them into your bundle.

---

## 🔄 Auto Server Restart

The dev server automatically restarts when any `.env*` file is created or changed in your project root — no manual restart needed.

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
});
```

> **Critical:** If you change `envPrefix`, you are changing what gets exposed to the browser. Break this → you leak secrets.

---

## 📚 API

### `getEnv(key)`

Returns `string | undefined`. Auto-imported in API routes.

Lookup order:
1. `Deno.env.get(key)` — Deno / Netlify Edge
2. `process.env[key]` — Node, Bun, Vercel Edge, Cloudflare Workers
3. `import.meta.env[key]` — Vite client (prefixed variants only)

```ts
const debug = getEnv('DEBUG_MODE');
```

### `requireEnv(key)`

Same as `getEnv` but throws if missing:

```
[bini-env] Missing required environment variable: "SMTP_PASS"
  → In development: add it to your .env file.
  → In production: set it in your hosting dashboard.
```

Use this for anything critical that must exist at startup.

```ts
const dbUrl = requireEnv('DATABASE_URL');
```

### `biniEnv(options)`

Vite plugin. Handles `.env` loading, terminal output, and dev server watching.

---

## 📂 Env File Resolution Order

Higher entries take priority:

1. `.env.local`
2. `.env.[mode].local`
3. `.env.[mode]`
4. `.env`

Loaded once. Cached. No repeated disk reads.

---

## ⚡ Performance

| Metric        | Dev       | Prod        |
| ------------- | --------- | ----------- |
| File Reads    | 1–5       | 0           |
| Runtime Cost  | ~5ms once | 0           |
| Bundle Impact | Minimal   | Tree-shaken |

If you see overhead in production, you did something wrong.

---

## 🔥 Common Failure Modes

### "Env is undefined"
You forgot the prefix (`BINI_` or `VITE_`) on a client-side var, or you're reading an unprefixed secret from `import.meta.env`.

### "Works in dev, broken in prod"
You relied on a `.env` file in production. Set vars in your hosting dashboard.

### "Secrets leaked"
You exposed them via `BINI_` or `VITE_` prefix. Those are public. Use unprefixed vars for secrets.

### "Works on Node, broken on Vercel/Netlify/Cloudflare"
You had the old version with static `fs`/`path` imports. Upgrade — this version is edge-safe.

### "Cloudflare secret not found"
Secrets added via `wrangler secret put` are only available via `c.env` inside your handler. Use `wrangler.toml [vars]` for anything `getEnv` needs at the top level.

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