// src/index.ts
import fs from 'fs';
import path from 'path';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';

/* ==========================================================================
   Global type declarations for cross-runtime compatibility
   ========================================================================== */

// Deno runtime type — declared as an interface so we can safely cast
// without relying on a global that TypeScript doesn't know about
interface DenoEnv {
  get(key: string): string | undefined;
  toObject(): Record<string, string>;
}
interface DenoNamespace {
  env: DenoEnv;
}

// Vite augments ImportMeta with .env
// Using triple-slash reference so it works both inside and outside Vite projects
/// <reference types="vite/client" />

/* ==========================================================================
   Types
   ========================================================================== */

export interface BiniEnvPluginOptions {
  /**
   * Enable/disable the plugin
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Remove Vite's default header
   * @default true
   */
  readonly clearViteHeader?: boolean;

  /**
   * Custom logo/text to display
   * @default 'ß'
   */
  readonly logo?: string;

  /**
   * Override the env var prefix exposed to client code.
   * Defaults to 'BINI_' — so BINI_MY_VAR is accessible via import.meta.env.BINI_MY_VAR
   * Set to 'VITE_' to keep Vite's default behaviour.
   * @default 'BINI_'
   */
  readonly envPrefix?: string;
}

export interface DetectedEnvFile {
  readonly name: string;
  readonly path: string;
}

/* ==========================================================================
   Constants
   ========================================================================== */

const BINI_LOGO = 'ß' as const;
const DEFAULT_ENV_PREFIX = 'BINI_' as const;

const DEFAULT_OPTIONS = {
  enabled: true,
  clearViteHeader: true,
  logo: BINI_LOGO,
  envPrefix: DEFAULT_ENV_PREFIX,
} as const;

const COLORS = {
  CYAN: '\x1b[36m',
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
} as const;

/* ==========================================================================
   getEnv — Universal env var accessor
   Works in: Node.js, Deno (edge functions), Bun, Vite client
   ========================================================================== */

/**
 * Read an environment variable in any runtime.
 *
 * Priority order:
 *  1. Deno.env       — Netlify edge functions / Deno runtime
 *  2. process.env    — Node.js / Bun / bini-server
 *  3. import.meta.env — Vite client (BINI_-prefixed vars)
 *
 * Usage in API routes:
 *   import { getEnv } from 'bini-env';
 *   const smtpUser = getEnv('SMTP_USER');
 */
export function getEnv(key: string): string | undefined {
  // 1. Deno runtime (Netlify edge functions)
  const deno = (globalThis as unknown as { Deno?: DenoNamespace }).Deno;
  if (deno) {
    try {
      const val = deno.env.get(key);
      if (val !== undefined) return val;
    } catch {
      // Deno env access denied — fall through
    }
  }

  // 2. Node.js / Bun / bini-server
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key] !== undefined) return process.env[key];
  }

  // 3. Vite injected (import.meta.env) — BINI_-prefixed client vars
  // Wrapped in try/catch because import.meta.env doesn't exist in Node/Deno
  try {
    const metaEnv = import.meta.env as Record<string, string | undefined> | undefined;
    if (metaEnv) {
      if (metaEnv[key] !== undefined) return metaEnv[key];
      // Try with BINI_ prefix automatically
      if (metaEnv[`BINI_${key}`] !== undefined) return metaEnv[`BINI_${key}`];
    }
  } catch {
    // import.meta.env not available in this runtime — ignore
  }

  return undefined;
}

/**
 * Read an environment variable and throw if it's missing or empty.
 * Use this for required secrets so you get a clear error at startup
 * instead of a cryptic crash later.
 *
 * Usage:
 *   const smtpPass = requireEnv('SMTP_PASS');
 */
export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (!val) {
    throw new Error(
      `[bini-env] Missing required environment variable: "${key}".\n` +
      `  → In development: add it to your .env file.\n` +
      `  → In production: add it to your hosting dashboard environment variables.`
    );
  }
  return val;
}

/* ==========================================================================
   loadEnv — Auto dotenv loader for bini-router API routes (Node.js only)
   Called internally by the Vite plugin. Safe to call multiple times.
   ========================================================================== */

let _envLoaded = false;

/**
 * Auto-load .env into process.env for Node.js API route contexts.
 *
 * Behaviour by environment:
 *  - Deno (edge functions)  → no-op, Deno/Netlify injects env natively
 *  - NODE_ENV=production    → no-op, host injects env vars automatically
 *  - Node.js dev            → loads .env via dotenv (dynamic import, safe for bundlers)
 *
 * Called automatically by bini-env Vite plugin. You should not need to call this manually.
 */
export async function loadEnv(projectRoot?: string): Promise<void> {
  // Already loaded — skip
  if (_envLoaded) return;

  // Deno runtime — env is handled natively, skip
  if ((globalThis as unknown as { Deno?: DenoNamespace }).Deno) {
    _envLoaded = true;
    return;
  }

  // Not in a Node-like runtime — skip
  if (typeof process === 'undefined' || !process.env) {
    _envLoaded = true;
    return;
  }

  // Production — host injects env vars, dotenv not needed
  if (process.env.NODE_ENV === 'production') {
    _envLoaded = true;
    return;
  }

  try {
    const root = projectRoot ?? process.cwd();
    const envPath = path.join(root, '.env');

    if (!fs.existsSync(envPath)) {
      _envLoaded = true;
      return;
    }

    // Dynamic import so Deno/edge bundlers never try to statically resolve dotenv
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath });
  } catch {
    // dotenv not installed or read failed — silently skip.
    // requireEnv() will surface clear errors if vars are missing when used.
  }

  _envLoaded = true;
}

/* ==========================================================================
   detectEnvFiles — used by the Vite plugin display
   ========================================================================== */

/**
 * Detect which .env files exist in the project root, in Vite's priority order.
 */
export function detectEnvFiles(projectRoot: string = process.cwd()): DetectedEnvFile[] {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const candidates = [
    '.env.local',
    `.env.${nodeEnv}.local`,
    `.env.${nodeEnv}`,
    '.env',
  ] as const;

  const found: DetectedEnvFile[] = [];

  for (const file of candidates) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      found.push({ name: file, path: filePath });
    }
  }

  return found;
}

/* ==========================================================================
   Vite plugin
   ========================================================================== */

function clearLine(): void {
  process.stdout.write('\x1b[2K\r');
}

function printResolvedUrls(urls: { local: string[]; network: string[] } | null | undefined): void {
  if (!urls) return;
  if (urls.local.length > 0)
    console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Local:   ${COLORS.CYAN}${urls.local[0]}${COLORS.RESET}`);
  if (urls.network.length > 0)
    console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Network: ${COLORS.CYAN}${urls.network[0]}${COLORS.RESET}`);
}

/**
 * Bini.js Vite plugin.
 *
 * What it does:
 *  - Sets envPrefix to 'BINI_' so client code uses import.meta.env.BINI_MY_VAR
 *  - Auto-loads .env for API routes in dev via loadEnv()
 *  - Replaces Vite's startup output with the Bini.js branded header
 */
export function biniEnv(options: Readonly<BiniEnvPluginOptions> = {}): Plugin {
  const resolvedOptions = Object.freeze({ ...DEFAULT_OPTIONS, ...options });
  const { enabled, clearViteHeader, logo, envPrefix } = resolvedOptions;

  let resolvedConfig: ResolvedConfig;
  let serverStarted = false;
  let previewStarted = false;

  return {
    name: 'vite-plugin-bini-env',

    apply: 'serve',

    // Set BINI_ as the env prefix so import.meta.env.BINI_* works in client code
    config(): UserConfig {
      return { envPrefix };
    },

    configResolved(cfg: ResolvedConfig) {
      resolvedConfig = cfg;
    },

    configureServer(server) {
      if (!enabled) return;

      // Auto-load .env after server starts — guarantees resolvedConfig is available
      // Falls back to immediate call in middleware mode where httpServer is null
      if (server.httpServer) {
        server.httpServer.once('listening', () => {
          void loadEnv(resolvedConfig?.root ?? process.cwd());
        });
      } else {
        // Middleware mode — httpServer is null, call immediately
        void loadEnv(resolvedConfig?.root ?? process.cwd());
      }

      const originalPrintUrls = server.printUrls.bind(server);

      server.printUrls = () => {
        if (serverStarted) return;
        serverStarted = true;

        if (clearViteHeader) clearLine();
        console.log(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (dev)`);

        const found = detectEnvFiles(resolvedConfig?.root);
        if (found.length > 0) {
          const envString = found.map((f) => f.name).join(', ');
          console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${envString}`);
        }

        if (!clearViteHeader) {
          originalPrintUrls();
        } else {
          printResolvedUrls(server.resolvedUrls);
        }
      };
    },

    configurePreviewServer(server) {
      if (!enabled) return;

      const originalPrintUrls = server.printUrls.bind(server);

      server.printUrls = () => {
        if (previewStarted) return;
        previewStarted = true;

        if (clearViteHeader) clearLine();
        console.log(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (preview)`);

        const found = detectEnvFiles(resolvedConfig?.root);
        if (found.length > 0) {
          const envString = found.map((f) => f.name).join(', ');
          console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${envString}`);
        }

        if (!clearViteHeader) {
          originalPrintUrls();
        } else {
          printResolvedUrls(server.resolvedUrls);
        }
      };
    },

    buildEnd() {
      serverStarted = false;
      previewStarted = false;
    },
  };
}

// Named export: import { biniEnv } from 'bini-env'
export type { Plugin } from 'vite';