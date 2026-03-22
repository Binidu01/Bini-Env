# bini-env

![npm](https://img.shields.io/npm/v/bini-env?color=cyan&style=flat-square)
![npm downloads](https://img.shields.io/npm/dm/bini-env?style=flat-square)
![license](https://img.shields.io/npm/l/bini-env?style=flat-square)
![vite](https://img.shields.io/badge/vite-plugin-646CFF?style=flat-square&logo=vite)
![typescript](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square&logo=typescript)

Universal environment variable loader and Vite plugin for Bini.js. Automatically loads `.env` files in development, reads env vars from the host in production, and works across Node.js, Deno, Bun, and Vite edge functions — with zero configuration.

## Features

- **Universal `getEnv()` / `requireEnv()`** — read env vars in any runtime (Node.js, Deno, Bun, Vite client)
- **Auto `.env` loading** — no manual `dotenv` setup needed in API routes
- **`BINI_` prefix** — replaces Vite's `VITE_` prefix with `BINI_` automatically
- **Branded startup banner** — replaces Vite's default header with a clean Bini.js output
- **Supports dev and preview modes**
- **Safe for edge bundlers** — dotenv is loaded via dynamic import, never statically resolved

---

## Installation

```bash
pnpm add bini-env
# or
npm install bini-env
# or
yarn add bini-env
```

---

## Vite Plugin Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import biniEnv from 'bini-env';

export default defineConfig({
  plugins: [biniEnv()]
});
```

That's it. Once added:
- Your `.env` is auto-loaded for API routes in dev
- Client code uses `import.meta.env.BINI_*` instead of `VITE_*`
- The startup banner is replaced with the Bini.js header

---

## Environment Variables

### `.env` file

```env
# Client-side vars — accessible via import.meta.env.BINI_*
BINI_FIREBASE_API_KEY=your_key
BINI_FIREBASE_AUTH_DOMAIN=your_domain

# Server-side vars — accessible via getEnv() in API routes
SMTP_USER=user@smtp.example.com
SMTP_PASS=your_password
FROM_EMAIL=App Name <noreply@example.com>
```

### In API routes

```ts
import { getEnv, requireEnv } from 'bini-env';

// Returns string | undefined
const smtpUser = getEnv('SMTP_USER');

// Returns string — throws a clear error if missing
const smtpPass = requireEnv('SMTP_PASS');
```

### In client code (React / Vue / etc.)

```ts
// Works because bini-env sets envPrefix: 'BINI_' automatically
const apiKey = import.meta.env.BINI_FIREBASE_API_KEY;
```

---

## How env loading works by environment

| Environment | How vars are loaded | dotenv used? |
|---|---|---|
| Dev (Node.js / bini-router) | Auto-loaded from `.env` by bini-env | ✅ Yes (automatic) |
| Preview (`vite preview`) | Auto-loaded from `.env` by bini-env | ✅ Yes (automatic) |
| Production (Netlify / Vercel) | Injected by host dashboard | ❌ No |
| Production (bini-server / VPS) | Set via server env or hosting panel | ❌ No |
| Deno / Edge Functions | Read from `Deno.env` natively | ❌ No |

You never need to import or configure `dotenv` manually.

---

## Startup Output

**Dev mode**
```
  ß Bini.js (dev)
  ➜  Environments: .env.local, .env
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.10:3000/
```

**Preview mode**
```
  ß Bini.js (preview)
  ➜  Environments: .env.local, .env
  ➜  Local:   http://localhost:4173/
  ➜  Network: http://192.168.1.10:4173/
```

---

## Plugin Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable or disable the plugin |
| `clearViteHeader` | `boolean` | `true` | Replace Vite's default startup header |
| `logo` | `string` | `'ß'` | Custom logo or text shown in the banner |
| `envPrefix` | `string` | `'BINI_'` | Prefix for client-side env vars in `import.meta.env` |

```ts
biniEnv({
  logo: '🚀',
  clearViteHeader: true,
  envPrefix: 'BINI_', // change to 'VITE_' to keep Vite's default
})
```

---

## Detected `.env` Files

The plugin checks for the following files in your project root (in priority order):

1. `.env.local`
2. `.env.[NODE_ENV].local`
3. `.env.[NODE_ENV]`
4. `.env`

---

## API Reference

### `getEnv(key: string): string | undefined`

Read an environment variable in any runtime. Checks `Deno.env` → `process.env` → `import.meta.env` in order.

```ts
import { getEnv } from 'bini-env';

const smtpUser = getEnv('SMTP_USER');
```

### `requireEnv(key: string): string`

Same as `getEnv` but throws a descriptive error if the variable is missing or empty. Use this for required secrets.

```ts
import { requireEnv } from 'bini-env';

const smtpPass = requireEnv('SMTP_PASS');
// Throws: [bini-env] Missing required environment variable: "SMTP_PASS".
//   → In development: add it to your .env file.
//   → In production: add it to your hosting dashboard environment variables.
```

### `loadEnv(projectRoot?: string): Promise<void>`

Manually trigger `.env` loading. Called automatically by the Vite plugin — you should not need this.

### `detectEnvFiles(projectRoot?: string): DetectedEnvFile[]`

Scan a directory for `.env` files and return an array of matches.

```ts
import { detectEnvFiles } from 'bini-env';

const files = detectEnvFiles('/my/project');
// [{ name: '.env.local', path: '/my/project/.env.local' }, ...]
```

---

## Types

```ts
interface BiniEnvPluginOptions {
  enabled?: boolean;
  clearViteHeader?: boolean;
  logo?: string;
  envPrefix?: string;
}

interface DetectedEnvFile {
  name: string;
  path: string;
}
```

---

## Compatibility

| Runtime | Supported |
|---|---|
| Node.js 18+ | ✅ |
| Bun | ✅ |
| Deno / Edge Functions | ✅ |
| Vite 7 | ✅ |
| Vite 8 | ✅ |

---

## License

MIT