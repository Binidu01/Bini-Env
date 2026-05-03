// bini-env/src/index.ts
import type { Plugin, PreviewServer, ResolvedConfig, UserConfig, ViteDevServer } from 'vite';

/* ==========================================================================
   Runtime detection — must run before anything else
   ========================================================================== */

function isNodeLike(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.env &&
    typeof process.versions === 'object' &&
    // Edge runtimes (Vercel, Cloudflare) expose a minimal `process` but not
    // `process.versions.node`. Checking for it keeps us out of edge bundles.
    (typeof process.versions.node === 'string' ||
      // Bun sets process.versions.bun
      typeof (process.versions as Record<string, unknown>).bun === 'string')
  );
}

function isDenoRuntime(): boolean {
  return typeof (globalThis as unknown as { Deno?: unknown }).Deno !== 'undefined';
}

/* ==========================================================================
   Capture originals FIRST — before any patching occurs
   ========================================================================== */

const originalConsoleLog   = console.log.bind(console);
const originalConsoleError = console.error.bind(console);

/* ==========================================================================
   Default NODE_ENV — must run before anything else
   ========================================================================== */

if (isNodeLike() && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

/* ==========================================================================
   DOTENV LOG SUPPRESSION
   Patched once at module load; subsequent calls are no-ops.
   ========================================================================== */

let _suppressionApplied = false;

export function suppressDotenvLogsGlobally(): void {
  if (_suppressionApplied) return;
  _suppressionApplied = true;

  if (isNodeLike()) {
    process.env.DOTENV_QUIET = 'true';
  }

  const isDotenvNoise = (...args: unknown[]): boolean => {
    const msg = args.join(' ');
    return (
      msg.includes('[dotenv@')      ||
      msg.includes('injected env')  ||
      msg.includes('injecting env')
    );
  };

  console.log = (...args: unknown[]) => {
    if (!isDotenvNoise(...args)) originalConsoleLog(...args);
  };

  console.error = (...args: unknown[]) => {
    if (!isDotenvNoise(...args)) originalConsoleError(...args);
  };
}

// Apply once at module load
suppressDotenvLogsGlobally();

/* ==========================================================================
   Cross-runtime type declarations
   ========================================================================== */

interface DenoEnv {
  get(key: string): string | undefined;
}
interface DenoNamespace {
  env: DenoEnv;
}

/* ==========================================================================
   Public types
   ========================================================================== */

export interface BiniEnvPluginOptions {
  readonly enabled?: boolean;
  readonly clearViteHeader?: boolean;
  readonly logo?: string;
  readonly envPrefix?: string | string[];
  readonly loadInPreview?: boolean;
  /** @deprecated Suppression is always applied at module load; this option is ignored. */
  readonly suppressDotenvLogs?: boolean;
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
} satisfies Omit<Required<BiniEnvPluginOptions>, 'suppressDotenvLogs'>);

const enum COLORS {
  CYAN   = '\x1b[36m',
  RESET  = '\x1b[0m',
  GREEN  = '\x1b[32m',
  YELLOW = '\x1b[33m',
  RED    = '\x1b[31m',
  BOLD   = '\x1b[1m',
  DIM    = '\x1b[2m',
}

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
   Runtime helpers
   ========================================================================== */

function getDeno(): DenoNamespace | undefined {
  return (globalThis as unknown as { Deno?: DenoNamespace }).Deno;
}

/** Schedule a task compatible with Node, Bun, Deno, and edge runtimes. */
function defer(fn: () => void): void {
  if (typeof setImmediate !== 'undefined') {
    setImmediate(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

/* ==========================================================================
   getEnv
   ========================================================================== */

export function getEnv(key: string): string | undefined {
  if (envCache.has(key)) return envCache.get(key);

  // 1. Deno runtime
  const deno = getDeno();
  if (deno) {
    try {
      const value = deno.env.get(key);
      if (value !== undefined) {
        envCache.set(key, value);
        return value;
      }
    } catch { /* fall through */ }
  }

  // 2. Node.js / Bun / Edge (process.env is available on most edge runtimes too)
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value !== undefined) {
      envCache.set(key, value);
      return value;
    }
  }

  // 3. Vite client (import.meta.env) — also checks BINI_ and VITE_ prefixed variants
  try {
    const metaEnv = import.meta.env as Record<string, string | undefined> | undefined;
    if (metaEnv) {
      for (const candidate of [key, `BINI_${key}`, `VITE_${key}`]) {
        if (metaEnv[candidate] !== undefined) {
          envCache.set(key, metaEnv[candidate]);
          return metaEnv[candidate];
        }
      }
    }
  } catch { /* import.meta.env not available in this runtime */ }

  envCache.set(key, undefined);
  return undefined;
}

/* ==========================================================================
   requireEnv
   ========================================================================== */

export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (val === undefined) {
    biniLogger.error(
      `Missing required environment variable: "${key}"\n` +
      `  ${COLORS.DIM}→ In development: add it to your .env file.${COLORS.RESET}\n` +
      `  ${COLORS.DIM}→ In production: set it in your hosting dashboard.${COLORS.RESET}`,
    );
    throw new Error(`[bini-env] Missing required environment variable: "${key}"`);
  }
  return val;
}

/* ==========================================================================
   loadEnv
   - Only runs on Node-like runtimes (Node.js, Bun).
   - Edge runtimes and Deno skip entirely — they get vars from the host.
   - Idempotent; concurrent calls share one promise.
   ========================================================================== */

let _envLoaded  = false;
let _loadPromise: Promise<void> | null = null;

export async function loadEnv(projectRoot?: string): Promise<void> {
  if (_envLoaded) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      // Deno and edge runtimes do not use .env files — vars are injected by host
      if (isDenoRuntime() || !isNodeLike()) return;

      const root    = projectRoot ?? process.cwd();
      const nodeEnv = process.env.NODE_ENV ?? 'production';

      // Load order: lowest → highest priority (later files override earlier ones)
      const envFiles = [
        '.env',
        `.env.${nodeEnv}`,
        `.env.${nodeEnv}.local`,
        '.env.local',
      ];

      // Dynamic import keeps `dotenv` and `fs`/`path` out of edge bundles entirely.
      // Bundlers that trace static imports (esbuild, Rollup) will NOT follow
      // a runtime-gated dynamic import when tree-shaking is enabled.
      const [dotenvMod, fsMod, pathMod] = await Promise.all([
        import('dotenv'),
        import('node:fs'),
        import('node:path'),
      ]);
      const dotenv = dotenvMod;
      const fs     = fsMod.default ?? fsMod;
      const path   = pathMod.default ?? pathMod;

      for (const file of envFiles) {
        const filePath = path.join(root, file);
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
          dotenv.config({ path: filePath, override: true });
        } catch { /* file absent — skip */ }
      }

      // Invalidate cache so newly loaded vars are picked up by getEnv
      envCache.clear();
      _envLoaded = true;

    } catch (error) {
      biniLogger.error('Failed to load .env file', error);
      // Do NOT set _envLoaded — allow a retry on the next call.
    } finally {
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

/* ==========================================================================
   detectEnvFiles
   Node-only utility used by the Vite plugin (build-time only, never edge).
   ========================================================================== */

let _envFilesCache: DetectedEnvFile[] | null = null;
let _cacheKey = '';

export function detectEnvFiles(projectRoot?: string): DetectedEnvFile[] {
  // Guard: this function uses fs synchronously; bail on non-Node runtimes.
  if (!isNodeLike()) return [];

  const root    = projectRoot ?? process.cwd();
  const nodeEnv = process.env.NODE_ENV ?? 'production';
  const cacheKey = `${root}:${nodeEnv}`;
  if (_envFilesCache && _cacheKey === cacheKey) return _envFilesCache;

  // Inline the fs/path usage so no top-level import is needed.
  // This function is only ever called from the Vite plugin (configureServer /
  // configurePreviewServer), which runs in Node — never in an edge bundle.
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
      const triggerLoad = () => void loadEnv(getRoot());
      if (server.httpServer) {
        server.httpServer.once('listening', triggerLoad);
      } else {
        defer(triggerLoad);
      }

      // Watch for new or changed .env files and restart the dev server so the
      // fresh variables are picked up. Chokidar (bundled with Vite) handles the
      // add/change events; we reset _envLoaded so loadEnv re-reads on restart.
      const envGlob = `${getRoot()}/.env*`;
      server.watcher.add(envGlob);

      const onEnvChange = (filePath: string) => {
        // Ignore editor swap/temp files (.env.swp, .env~, etc.)
        if (/\.(swp|swo|bak|tmp)$|~$/.test(filePath)) return;

        biniLogger.info(
          `env file ${filePath.replace(getRoot() + '/', '')} changed — restarting server`,
        );

        // Reset load state so the restarted server re-reads all .env files
        _envLoaded  = false;
        _loadPromise = null;
        envCache.clear();
        _envFilesCache = null;

        void server.restart();
      };

      server.watcher.on('add',    onEnvChange);
      server.watcher.on('change', onEnvChange);

      // Remove listeners when the server closes so they don't stack across
      // restarts — Vite calls configureServer again on each restart.
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
        const triggerLoad = () => void loadEnv(getRoot());
        if (server.httpServer) {
          server.httpServer.once('listening', triggerLoad);
        } else {
          defer(triggerLoad);
        }
      }

      if (clearViteHeader || logo !== BINI_LOGO) {
        patchPrintUrls(server, 'preview', logo, clearViteHeader, getRoot, loadInPreview);
      }
    },
  };
}

export type { Plugin } from 'vite';