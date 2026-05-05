// bini-env/src/index.ts
import { env } from 'hono/adapter';
import type { Plugin, PreviewServer, ResolvedConfig, UserConfig, ViteDevServer } from 'vite';

/* ==========================================================================
   Runtime detection — used by Vite plugin hooks only
   ========================================================================== */

function isNodeLike(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.env &&
    typeof process.versions === 'object' &&
    (typeof process.versions.node === 'string' ||
      typeof (process.versions as Record<string, unknown>).bun === 'string')
  );
}

/* ==========================================================================
   Capture originals FIRST — before any patching occurs
   ========================================================================== */

const originalConsoleLog   = console.log.bind(console);
const originalConsoleError = console.error.bind(console);

/* ==========================================================================
   Default NODE_ENV
   ========================================================================== */

if (isNodeLike() && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

/* ==========================================================================
   HonoContext duck type

   We intentionally do NOT import Context<E,P,I> from hono because Hono 4.12
   added a [GET_MATCH_RESULT] symbol to HonoRequest, making every
   narrowly-typed Context (e.g. Context<BlankEnv, "/chat", BlankInput>)
   structurally incompatible with Context<any, any, any>. A minimal duck type
   that only requires what hono/adapter's env() accesses at runtime sidesteps
   the symbol variance entirely. Consumers cast with `c as any` once at the
   call site; the single `env(ctx as any)` below is the only unsafe cast in
   the entire package.
   ========================================================================== */

/** Minimal shape accepted by getEnv / requireEnv. Satisfied by any Hono Context. */
export type HonoContext = { env: unknown } & Record<string, unknown>;

/* ==========================================================================
   Public types
   ========================================================================== */

export interface BiniEnvPluginOptions {
  readonly enabled?        : boolean;
  readonly clearViteHeader?: boolean;
  readonly logo?           : string;
  readonly envPrefix?      : string | string[];
  readonly loadInPreview?  : boolean;
}

export interface DetectedEnvFile {
  readonly name: string;
  readonly path: string;
}

/* ==========================================================================
   Constants
   ========================================================================== */

const BINI_LOGO          = 'ß';
const DEFAULT_ENV_PREFIX = ['BINI_', 'VITE_'] as const;

const DEFAULT_OPTIONS = Object.freeze({
  enabled        : true,
  clearViteHeader: true,
  logo           : BINI_LOGO,
  envPrefix      : [...DEFAULT_ENV_PREFIX],
  loadInPreview  : true,
} satisfies Required<BiniEnvPluginOptions>);

const enum COLORS {
  CYAN   = '\x1b[36m',
  RESET  = '\x1b[0m',
  GREEN  = '\x1b[32m',
  YELLOW = '\x1b[33m',
  RED    = '\x1b[31m',
  BOLD   = '\x1b[1m',
  DIM    = '\x1b[2m',
}

// Build-time only cache — never used for request-scoped Hono env() results
const envCache = new Map<string, string | undefined>();

/* ==========================================================================
   Standalone logger
   ========================================================================== */

function timestamp(): string {
  return `${COLORS.DIM}${new Date().toLocaleTimeString('en-US', { hour12: false })}${COLORS.RESET}`;
}

export const biniLogger = {
  info(msg: string): void {
    originalConsoleLog(
      `${timestamp()} ${COLORS.CYAN}${COLORS.BOLD}[bini-env]${COLORS.RESET} ${msg}`,
    );
  },
  warn(msg: string): void {
    originalConsoleError(
      `${timestamp()} ${COLORS.YELLOW}${COLORS.BOLD}(!) [bini-env]${COLORS.RESET} ${COLORS.YELLOW}${msg}${COLORS.RESET}`,
    );
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error
      ? `\n    ${COLORS.DIM}${err.message}${COLORS.RESET}`
      : '';
    originalConsoleError(
      `${timestamp()} ${COLORS.RED}${COLORS.BOLD}[bini-env] error${COLORS.RESET} ${msg}${detail}`,
    );
  },
} as const;

/* ==========================================================================
   Vite plugin helper
   ========================================================================== */

function defer(fn: () => void): void {
  if (typeof setImmediate !== 'undefined') {
    setImmediate(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

/* ==========================================================================
   Module-level Hono context store

   Lets getEnv / requireEnv work without an explicit `c` argument at every
   call site. Register once in a global middleware:

     app.use('*', (c, next) => { setContext(c as any); return next(); });
   ========================================================================== */

let _honoContext: HonoContext | null = null;

export function setContext(c: HonoContext): void {
  _honoContext = c;
}

export function clearContext(): void {
  _honoContext = null;
}

/* ==========================================================================
   getEnv

   Resolution order:
     1. Explicit Hono Context  (c param)   — request-scoped, never cached
     2. Stored Hono Context    (setContext) — request-scoped, never cached
     3. process.env            (build-time / Vite plugin hooks — no c available)

   Usage:
     getEnv(c as any, 'KEY')   — inside a Hono route / middleware
     getEnv('KEY')             — outside request context (build-time)
   ========================================================================== */

export function getEnv(c: HonoContext | string, key?: string): string | undefined {
  const resolvedKey = typeof c === 'string' ? c : key!;
  const resolvedCtx = typeof c === 'string' ? null : c;

  // 1 & 2. Hono env() — covers all runtimes: CF Workers, Node, Bun, Deno, Edge
  const ctx = resolvedCtx ?? _honoContext;
  if (ctx) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const honoEnvs = env(ctx as any) as Record<string, string | undefined>;
      const value    = honoEnvs[resolvedKey];
      if (value !== undefined) return value; // never cache — request-scoped
    } catch { /* context binding unavailable — fall through */ }
  }

  // 3. process.env — build-time only (Vite plugin hooks run outside any request)
  if (envCache.has(resolvedKey)) return envCache.get(resolvedKey);

  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[resolvedKey];
    envCache.set(resolvedKey, value);
    return value;
  }

  envCache.set(resolvedKey, undefined);
  return undefined;
}

/* ==========================================================================
   requireEnv
   ========================================================================== */

export function requireEnv(c: HonoContext | string, key?: string): string {
  const resolvedKey = typeof c === 'string' ? c : key!;
  const val = getEnv(c, resolvedKey);
  if (val === undefined) {
    biniLogger.error(
      `Missing required environment variable: "${resolvedKey}"\n` +
      `  ${COLORS.DIM}→ In development: set it in your platform's env config.${COLORS.RESET}\n` +
      `  ${COLORS.DIM}→ In production: set it in your hosting dashboard.${COLORS.RESET}`,
    );
    throw new Error(`[bini-env] Missing required environment variable: "${resolvedKey}"`);
  }
  return val;
}

/* ==========================================================================
   detectEnvFiles
   Node-only — used by the Vite plugin at build/dev time, never on edge.
   ========================================================================== */

let _envFilesCache: DetectedEnvFile[] | null = null;
let _cacheKey = '';

export function detectEnvFiles(projectRoot?: string): DetectedEnvFile[] {
  if (!isNodeLike()) return [];

  const root     = projectRoot ?? process.cwd();
  const nodeEnv  = process.env.NODE_ENV ?? 'production';
  const cacheKey = `${root}:${nodeEnv}`;
  if (_envFilesCache && _cacheKey === cacheKey) return _envFilesCache;

  let fsSync: typeof import('fs');
  let pathMod: typeof import('path');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fsSync  = require('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pathMod = require('node:path');
  } catch {
    return [];
  }

  const candidates = [
    '.env.local',
    `.env.${nodeEnv}.local`,
    `.env.${nodeEnv}`,
    '.env',
  ];

  const found: DetectedEnvFile[] = [];
  for (const file of candidates) {
    try {
      const filePath = pathMod.join(root, file);
      if (fsSync.existsSync(filePath)) found.push({ name: file, path: filePath });
    } catch { /* skip unreadable paths */ }
  }

  _envFilesCache = found;
  _cacheKey      = cacheKey;
  return found;
}

/* ==========================================================================
   Vite plugin helpers
   ========================================================================== */

function clearLine(): void {
  if (typeof process !== 'undefined' && process.stdout?.isTTY) {
    process.stdout.write('\x1b[2K\r');
  }
}

function printResolvedUrls(
  urls: { local: string[]; network: string[] } | null | undefined,
): void {
  if (!urls) return;
  if (urls.local.length > 0) {
    originalConsoleLog(
      `  ${COLORS.GREEN}➜${COLORS.RESET}  Local:   ${COLORS.CYAN}${urls.local[0]}${COLORS.RESET}`,
    );
  }
  if (urls.network.length > 0) {
    originalConsoleLog(
      `  ${COLORS.GREEN}➜${COLORS.RESET}  Network: ${COLORS.CYAN}${urls.network[0]}${COLORS.RESET}`,
    );
  }
}

type ServerLike = ViteDevServer | PreviewServer;

function patchPrintUrls(
  server         : ServerLike,
  mode           : 'dev' | 'preview',
  logo           : string,
  clearViteHeader: boolean,
  getRoot        : () => string,
  showEnvFiles   : boolean,
): void {
  let started = false;
  const originalPrintUrls = server.printUrls.bind(server);

  server.printUrls = () => {
    if (started) return;
    started = true;

    if (clearViteHeader) clearLine();
    originalConsoleLog(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (${mode})`);

    if (showEnvFiles) {
      const found = detectEnvFiles(getRoot());
      if (found.length > 0) {
        originalConsoleLog(
          `  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${found.map(f => f.name).join(', ')}`,
        );
      }
    }

    if (clearViteHeader) {
      printResolvedUrls(server.resolvedUrls);
    } else {
      originalPrintUrls();
    }
  };
}

/* ==========================================================================
   Vite plugin
   ========================================================================== */

export function biniEnv(options: Readonly<BiniEnvPluginOptions> = {}): Plugin {
  if (options.enabled === false) {
    return { name: 'vite-plugin-bini-env' };
  }

  const { clearViteHeader, logo, envPrefix, loadInPreview } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let resolvedConfig: ResolvedConfig;
  const getRoot = () => resolvedConfig?.root ?? process.cwd();

  return {
    name: 'vite-plugin-bini-env',

    config(): UserConfig {
      return { envPrefix };
    },

    configResolved(cfg: ResolvedConfig) {
      resolvedConfig = cfg;
    },

    configureServer(server) {
      defer(() => envCache.clear());

      const envGlob = `${getRoot()}/.env*`;
      server.watcher.add(envGlob);

      const onEnvChange = (filePath: string) => {
        if (/\.(swp|swo|bak|tmp)$|~$/.test(filePath)) return;

        biniLogger.info(
          `env file ${filePath.replace(getRoot() + '/', '')} changed — restarting server`,
        );

        envCache.clear();
        _envFilesCache = null;

        void server.restart();
      };

      server.watcher.on('add',    onEnvChange);
      server.watcher.on('change', onEnvChange);

      server.httpServer?.once('close', () => {
        server.watcher.off('add',    onEnvChange);
        server.watcher.off('change', onEnvChange);
      });

      if (clearViteHeader || logo !== BINI_LOGO) {
        patchPrintUrls(server, 'dev', logo, clearViteHeader, getRoot, true);
      }
    },

    configurePreviewServer(server) {
      if (loadInPreview) {
        defer(() => envCache.clear());
      }

      if (clearViteHeader || logo !== BINI_LOGO) {
        patchPrintUrls(server, 'preview', logo, clearViteHeader, getRoot, loadInPreview);
      }
    },
  };
}

export type { Plugin } from 'vite';
export type { Context } from 'hono';