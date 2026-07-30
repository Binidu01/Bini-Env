/**
 * bini-env/src/index.ts
 *
 * Two responsibilities only:
 *  1. Tell Vite which env prefixes to expose to import.meta.env  (biniEnv plugin)
 *  2. Read env vars from the Hono request context                (getEnv / requireEnv)
 *
 * process.env is never used. All runtime env access goes through Hono's env() adapter,
 * which handles Node, Bun, Cloudflare Workers, Deno, and Vercel Edge natively.
 */

import { env } from 'hono/adapter';
import type { Context } from 'hono';
import type { Plugin, UserConfig, ViteDevServer, PreviewServer } from 'vite';

/* ==========================================================================
   ANSI helpers — used by biniLogger only
   ========================================================================== */

const C = {
  CYAN  : '\x1b[36m',
  RESET : '\x1b[0m',
  YELLOW: '\x1b[33m',
  RED   : '\x1b[31m',
  BOLD  : '\x1b[1m',
  DIM   : '\x1b[2m',
} as const;

/* ==========================================================================
   Public types
   ========================================================================== */

/**
 * Accepts any Hono Context. Typed against Hono's own Context rather than a
 * loose duck type so misuse is caught at the call site.
 */
export type HonoContext = Context;

export interface BiniEnvPluginOptions {
  /** Extra prefixes to expose to import.meta.env, in addition to BINI_ and VITE_. */
  readonly envPrefix?: string | string[];
}

/* ==========================================================================
   Logger
   ========================================================================== */

function _ts(): string {
  return `${C.DIM}${new Date().toLocaleTimeString('en-US', { hour12: false })}${C.RESET}`;
}

export const biniLogger = {
  info(msg: string): void {
    console.log(`${_ts()} ${C.CYAN}${C.BOLD}[bini-env]${C.RESET} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(
      `${_ts()} ${C.YELLOW}${C.BOLD}(!) [bini-env]${C.RESET} ${C.YELLOW}${msg}${C.RESET}`,
    );
  },
  error(msg: string, err?: unknown): void {
    const detail =
      err instanceof Error ? `\n    ${C.DIM}${err.message}${C.RESET}` : '';
    console.error(
      `${_ts()} ${C.RED}${C.BOLD}[bini-env] error${C.RESET} ${msg}${detail}`,
    );
  },
} as const;

/* ==========================================================================
   getEnv

   Reads exclusively from Hono's env() adapter. No process.env fallback.
   Hono handles all platform differences:
     Node / Bun       → process.env
     Cloudflare       → c.env bindings
     Deno / Netlify   → Deno.env.get()
     Vercel Edge      → process.env (V8 Node compat)
   ========================================================================== */

export function getEnv(c: HonoContext, key: string): string | undefined {
  const honoEnvs = env(c) as Record<string, string | undefined>;
  return honoEnvs[key];
}

/* ==========================================================================
   requireEnv

   Same as getEnv but throws immediately if the variable is missing or empty.
   Always handle the thrown error in your route's catch block.
   ========================================================================== */

export function requireEnv(c: HonoContext, key: string): string {
  const val = getEnv(c, key);

  if (!val) {
    biniLogger.error(
      `Missing required environment variable: "${key}"\n` +
      `  ${C.DIM}-> Set it in your platform's env config or hosting dashboard.${C.RESET}`,
    );

    throw new Error(`[bini-env] Missing required environment variable: "${key}"`);
  }

  return val;
}

/* ==========================================================================
   biniEnv — Vite plugin

   Tells Vite which prefixes to expose to import.meta.env.
   Prints the ß Bini.js banner on dev and preview server start.
   Vite handles .env file loading, watching, server restarts, and HMR natively.
   ========================================================================== */

const DEFAULT_PREFIXES = ['BINI_', 'VITE_'] as const;

function detectEnvFiles(root: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require('node:fs')   as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('path');
    const nodeEnv = process.env.NODE_ENV ?? 'production';
    return [
      '.env.local',
      `.env.${nodeEnv}.local`,
      `.env.${nodeEnv}`,
      '.env',
    ].filter(f => fs.existsSync(path.join(root, f)));
  } catch {
    return [];
  }
}

function printBanner(server: ViteDevServer | PreviewServer, mode: 'dev' | 'preview', root: string): void {
  const original = server.printUrls.bind(server);
  server.printUrls = () => {
    console.log(`\n  ${C.CYAN}ß Bini.js${C.RESET} (${mode})`);
    const found = detectEnvFiles(root);
    if (found.length > 0) {
      console.log(`  \x1b[32m➜\x1b[0m  Environments: ${found.join(', ')}`);
    }
    original();
  };
}

export function biniEnv(options: Readonly<BiniEnvPluginOptions> = {}): Plugin {
  const extraPrefixes = options.envPrefix
    ? (Array.isArray(options.envPrefix) ? options.envPrefix : [options.envPrefix])
    : [];

  const envPrefix = [
    ...new Set([...DEFAULT_PREFIXES, ...extraPrefixes]),
  ];

  return {
    name: 'bini-env',

    config(): UserConfig {
      return { envPrefix };
    },

    configureServer(server) {
      printBanner(server, 'dev', server.config.root);
    },

    configurePreviewServer(server) {
      printBanner(server, 'preview', server.config.root);
    },
  };
}

/* ==========================================================================
   Re-exports
   ========================================================================== */

export type { Plugin } from 'vite';