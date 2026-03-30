# bini-env

![npm](https://img.shields.io/npm/v/bini-env?color=cyan\&style=flat-square)
![npm downloads](https://img.shields.io/npm/dm/bini-env?style=flat-square)
![license](https://img.shields.io/npm/l/bini-env?style=flat-square)
![vite](https://img.shields.io/badge/vite-%3E%3D8.0-646CFF?style=flat-square\&logo=vite)
![typescript](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square\&logo=typescript)
![node](https://img.shields.io/badge/node-%3E%3D20.19-339933?style=flat-square\&logo=node.js)

**Zero-config environment variable system + Vite plugin for Bini.js**
Loads `.env` in development, uses host-provided variables in production, and works across Node.js, Bun, Deno, and edge runtimes — without leaking secrets or adding runtime cost.

---

## ⚠️ Before You Use This

This library **does NOT magically make env vars safe**.

* Anything exposed to the client (`import.meta.env`) is **public**.
* Only server-side code (`getEnv`, `requireEnv`) can safely access secrets.
* Misconfigured prefixes = **data leak**.

If you don’t understand this, stop and fix that first.

---

## ✨ Features

* **Universal API** — `getEnv()` / `requireEnv()` work across runtimes
* **Zero-config `.env` loading** in development
* **Strict production behavior** — no file reads, no dotenv
* **Prefix control** — supports `BINI_`, `VITE_`, or custom
* **Tree-shakeable** — no dead code in client bundles
* **Edge-safe** — no static dotenv import
* **Typed** — full TypeScript support
* **Fast** — single load in dev, zero overhead in prod

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

## 🚀 Quick Start (Don’t Overthink It)

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { biniEnv } from 'bini-env';

export default defineConfig({
  plugins: [biniEnv()]
});
```

Done.

If this doesn’t work, your project setup is broken — not the plugin.

---

## 🔐 Environment Rules (Read This Twice)

> ✅ **Good news:** Both `BINI_` and `VITE_` prefixes work out of the box — no extra config needed.

### Client (PUBLIC)

```env
BINI_PUBLIC_API_URL=https://api.example.com
VITE_ANALYTICS_ID=UA-XXXX
```

Accessible via:

```ts
import.meta.env.BINI_PUBLIC_API_URL
```

👉 **Never put secrets here. Ever.**

---

### Server (PRIVATE)

```env
SMTP_PASS=super_secret
DATABASE_URL=postgres://...
```

```ts
import { requireEnv } from 'bini-env';

const pass = requireEnv('SMTP_PASS');
```

👉 If this leaks, it’s your fault, not the library’s.

---

## 🧠 How It Actually Works

| Mode             | Behavior                                 |
| ---------------- | ---------------------------------------- |
| Dev (`vite dev`) | Loads `.env` once via dynamic dotenv     |
| Preview          | Same as dev                              |
| Production       | Uses `process.env` / host injection only |
| Edge/Deno        | Uses native `Deno.env`                   |

**No runtime branching in client bundles. No hidden magic.**

---

## ⚙️ Plugin Options

```ts
biniEnv({
  enabled: true,
  clearViteHeader: true,
  logo: 'ß',
  envPrefix: ['BINI_', 'VITE_']
});
```

### Critical Detail

If you change `envPrefix`, you are changing what gets exposed to the browser.

Break this → you leak secrets.

---

## 📚 API

### `getEnv(key)`

Returns `string | undefined`.

Safe fallback reader across:

* `Deno.env`
* `process.env`
* `import.meta.env`

---

### `requireEnv(key)`

Same as `getEnv` but throws:

```txt
[bini-env] Missing required environment variable: "SMTP_PASS"
```

Use this for anything critical.

---

### `biniEnv(options)`

Vite plugin.

If your plugin order is wrong and things break, that’s on your config.

---

## 📂 Env File Resolution Order

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

### 1. “Env is undefined”

You forgot the prefix.

### 2. “Works in dev, broken in prod”

You relied on `.env` in production.

### 3. “Secrets leaked”

You exposed them via prefix.

### 4. “Types not found”

Add:

```ts
/// <reference types="vite/client" />
```

---

## 🧪 Reality Check

This library is intentionally simple.

If you need:

* secret rotation
* encrypted envs
* runtime validation schemas

That’s **your job**, not this package.

---

## 🤝 Contributing

PRs welcome — but:

* No bloat
* No magic
* No runtime cost

If it slows startup or increases bundle size, it’s getting rejected.

---

## 📄 License

MIT © Bini.js Team

---

**Ship fast. Leak nothing. Blame config, not tooling.**
