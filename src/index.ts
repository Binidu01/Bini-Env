// bini-env/src/index.ts
import fs from 'fs';
import path from 'path';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';

/* ==========================================================================
   Default NODE_ENV — must run before anything else
   ========================================================================== */

if (typeof process !== 'undefined' && process.env && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

/* ==========================================================================
   IMMEDIATE DOTENV SUPPRESSION - Runs at module load
   ========================================================================== */

export function suppressDotenvLogsGlobally(): void {
  if (typeof process !== 'undefined' && process.env) {
    process.env.DOTENV_QUIET = 'true';
  }

  const originalLog = console.log;
  console.log = (...args: any[]) => {
    const message = args.join(' ');
    if (message.includes('[dotenv@') && message.includes('injecting env')) {
      return;
    }
    originalLog(...args);
  };

  const originalError = console.error;
  console.error = (...args: any[]) => {
    const message = args.join(' ');
    if (message.includes('[dotenv@') && message.includes('injecting env')) {
      return;
    }
    originalError(...args);
  };
}

// Run suppression immediately when module loads
suppressDotenvLogsGlobally();

/* ==========================================================================
   Global type declarations for cross-runtime compatibility
   ========================================================================== */

interface DenoEnv {
  get(key: string): string | undefined;
  toObject(): Record<string, string>;
}
interface DenoNamespace {
  env: DenoEnv;
}

/// <reference types="vite/client" />

/* ==========================================================================
   Types
   ========================================================================== */

export interface BiniEnvPluginOptions {
  readonly enabled?: boolean;
  readonly clearViteHeader?: boolean;
  readonly logo?: string;
  readonly envPrefix?: string | string[];
  readonly loadInPreview?: boolean;
  readonly suppressDotenvLogs?: boolean;
}

export interface DetectedEnvFile {
  readonly name: string;
  readonly path: string;
}

/* ==========================================================================
   Constants
   ========================================================================== */

const BINI_LOGO = 'ß';
const DEFAULT_ENV_PREFIX: string[] = ['BINI_', 'VITE_'];

const DEFAULT_OPTIONS: Required<BiniEnvPluginOptions> = Object.freeze({
  enabled: true,
  clearViteHeader: true,
  logo: BINI_LOGO,
  envPrefix: DEFAULT_ENV_PREFIX,
  loadInPreview: true,
  suppressDotenvLogs: true,
});

const enum COLORS {
  CYAN  = '\x1b[36m',
  RESET = '\x1b[0m',
  GREEN = '\x1b[32m',
}

const envCache = new Map<string, string | undefined>();

// Store original console functions before any patching
const originalConsoleLog   = console.log;
const originalConsoleError = console.error;

/* ==========================================================================
   getEnv
   ========================================================================== */

export function getEnv(key: string): string | undefined {
  if (envCache.has(key)) {
    return envCache.get(key);
  }

  let value: string | undefined;

  // 1. Deno runtime
  const deno = (globalThis as unknown as { Deno?: DenoNamespace }).Deno;
  if (deno) {
    try {
      value = deno.env.get(key);
      if (value !== undefined) {
        envCache.set(key, value);
        return value;
      }
    } catch {
      // fall through
    }
  }

  // 2. Node.js / Bun
  if (typeof process !== 'undefined' && process.env) {
    value = process.env[key];
    if (value !== undefined) {
      envCache.set(key, value);
      return value;
    }
  }

  // 3. Vite client (import.meta.env)
  try {
    const metaEnv = import.meta.env as Record<string, string | undefined> | undefined;
    if (metaEnv) {
      if (metaEnv[key] !== undefined) {
        envCache.set(key, metaEnv[key]);
        return metaEnv[key];
      }
      const biniKey = `BINI_${key}`;
      if (metaEnv[biniKey] !== undefined) {
        envCache.set(key, metaEnv[biniKey]);
        return metaEnv[biniKey];
      }
      const viteKey = `VITE_${key}`;
      if (metaEnv[viteKey] !== undefined) {
        envCache.set(key, metaEnv[viteKey]);
        return metaEnv[viteKey];
      }
    }
  } catch {
    // import.meta.env not available
  }

  envCache.set(key, undefined);
  return undefined;
}

/* ==========================================================================
   requireEnv
   ========================================================================== */

export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (!val) {
    throw new Error(
      `[bini-env] Missing required environment variable: "${key}".\n` +
      `  → In development: add it to your .env file.\n` +
      `  → In production: add it to your hosting dashboard environment variables.`,
    );
  }
  return val;
}

/* ==========================================================================
   loadEnv
   ========================================================================== */

let _envLoaded  = false;
let _loadPromise: Promise<void> | null = null;

export async function loadEnv(projectRoot?: string): Promise<void> {
  if (_envLoaded) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      // Deno — env is already available via Deno.env
      if ((globalThis as unknown as { Deno?: DenoNamespace }).Deno) {
        _envLoaded = true;
        return;
      }

      if (typeof process === 'undefined' || !process.env) {
        _envLoaded = true;
        return;
      }

      const root = projectRoot ?? process.cwd();

      // Load order: lowest → highest priority
      const envFiles = [
        '.env',
        `.env.${process.env.NODE_ENV}`,
        `.env.${process.env.NODE_ENV}.local`,
        '.env.local',
      ];

      suppressDotenvLogsGlobally();

      const dotenv = await import('dotenv');

      for (const envFile of envFiles) {
        const envPath = path.join(root, envFile);
        try {
          await fs.promises.access(envPath, fs.constants.R_OK);
          dotenv.config({
            path    : envPath,
            override: true,
            quiet   : true,
          } as Parameters<typeof dotenv.config>[0]);
        } catch {
          // file doesn't exist — skip
        }
      }

      // Clear cache so newly loaded vars are picked up
      envCache.clear();

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        originalConsoleError('[bini-env] Warning: Failed to load .env file:', error);
      }
    } finally {
      _envLoaded   = true;
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

/* ==========================================================================
   detectEnvFiles
   ========================================================================== */

let _envFilesCache: DetectedEnvFile[] | null = null;
let _cachedRoot   = '';

export function detectEnvFiles(projectRoot: string = process.cwd()): DetectedEnvFile[] {
  if (_envFilesCache && _cachedRoot === projectRoot) {
    return _envFilesCache;
  }

  const nodeEnv = process.env.NODE_ENV ?? 'production';
  const candidates = [
    '.env.local',
    `.env.${nodeEnv}.local`,
    `.env.${nodeEnv}`,
    '.env',
  ];

  const found: DetectedEnvFile[] = [];

  for (const file of candidates) {
    const filePath = path.join(projectRoot, file);
    try {
      if (fs.existsSync(filePath)) {
        found.push({ name: file, path: filePath });
      }
    } catch {
      // skip
    }
  }

  _envFilesCache = found;
  _cachedRoot    = projectRoot;

  return found;
}

/* ==========================================================================
   Vite plugin
   ========================================================================== */

function clearLine(): void {
  if (process.stdout.isTTY) {
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

export function biniEnv(options: Readonly<BiniEnvPluginOptions> = {}): Plugin {
  if (options.enabled === false) {
    return { name: 'vite-plugin-bini-env' };
  }

  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { clearViteHeader, logo, envPrefix, loadInPreview, suppressDotenvLogs } = resolvedOptions;

  let resolvedConfig: ResolvedConfig;

  if (suppressDotenvLogs && typeof process !== 'undefined') {
    suppressDotenvLogsGlobally();
  }

  return {
    name: 'vite-plugin-bini-env',

    config(): UserConfig {
      return { envPrefix };
    },

    configResolved(cfg: ResolvedConfig) {
      resolvedConfig = cfg;
    },

    configureServer(server) {
      const loadEnvTask = () => {
        void loadEnv(resolvedConfig?.root ?? process.cwd());
      };

      if (server.httpServer) {
        server.httpServer.once('listening', loadEnvTask);
      } else {
        setImmediate(loadEnvTask);
      }

      let serverStarted = false;
      const originalPrintUrls = server.printUrls.bind(server);

      if (clearViteHeader || logo !== BINI_LOGO) {
        server.printUrls = () => {
          if (serverStarted) return;
          serverStarted = true;

          if (clearViteHeader) clearLine();
          originalConsoleLog(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (dev)`);

          const found = detectEnvFiles(resolvedConfig?.root);
          if (found.length > 0) {
            originalConsoleLog(
              `  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${found.map(f => f.name).join(', ')}`,
            );
          }

          if (!clearViteHeader) {
            originalPrintUrls();
          } else {
            printResolvedUrls(server.resolvedUrls);
          }
        };
      }
    },

    configurePreviewServer(server) {
      if (loadInPreview) {
        const loadEnvTask = () => {
          void loadEnv(resolvedConfig?.root ?? process.cwd());
        };

        if (server.httpServer) {
          server.httpServer.once('listening', loadEnvTask);
        } else {
          setImmediate(loadEnvTask);
        }
      }

      let previewStarted = false;
      const originalPrintUrls = server.printUrls.bind(server);

      if (clearViteHeader || logo !== BINI_LOGO) {
        server.printUrls = () => {
          if (previewStarted) return;
          previewStarted = true;

          if (clearViteHeader) clearLine();
          originalConsoleLog(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (preview)`);

          if (loadInPreview) {
            const found = detectEnvFiles(resolvedConfig?.root);
            if (found.length > 0) {
              originalConsoleLog(
                `  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${found.map(f => f.name).join(', ')}`,
              );
            }
          }

          if (!clearViteHeader) {
            originalPrintUrls();
          } else {
            printResolvedUrls(server.resolvedUrls);
          }
        };
      }
    },
  };
}

export type { Plugin } from 'vite';