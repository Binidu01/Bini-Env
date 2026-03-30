// src/index.ts
import fs from 'fs';
import path from 'path';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';

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
}

export interface DetectedEnvFile {
  readonly name: string;
  readonly path: string;
}

/* ==========================================================================
   Constants - Optimized with Object.freeze for immutability
   ========================================================================== */

const BINI_LOGO = 'ß';
const DEFAULT_ENV_PREFIX: string[] = ['BINI_', 'VITE_'];

const DEFAULT_OPTIONS: Required<BiniEnvPluginOptions> = Object.freeze({
  enabled: true,
  clearViteHeader: true,
  logo: BINI_LOGO,
  envPrefix: DEFAULT_ENV_PREFIX,
});

// ANSI color codes - using const enum for better performance
const enum COLORS {
  CYAN = '\x1b[36m',
  RESET = '\x1b[0m',
  GREEN = '\x1b[32m',
}

// Cache for environment variables to avoid repeated lookups
const envCache = new Map<string, string | undefined>();

/* ==========================================================================
   Optimized getEnv with caching
   ========================================================================== */

/**
 * Read an environment variable with caching for performance.
 * Cache is cleared on module reload in development only.
 */
export function getEnv(key: string): string | undefined {
  // Check cache first for frequent access patterns
  if (envCache.has(key)) {
    return envCache.get(key);
  }

  let value: string | undefined;

  // 1. Deno runtime (edge functions)
  const deno = (globalThis as unknown as { Deno?: DenoNamespace }).Deno;
  if (deno) {
    try {
      value = deno.env.get(key);
      if (value !== undefined) {
        envCache.set(key, value);
        return value;
      }
    } catch {
      // Silently fall through
    }
  }

  // 2. Node.js / Bun runtime
  if (typeof process !== 'undefined' && process.env) {
    value = process.env[key];
    if (value !== undefined) {
      envCache.set(key, value);
      return value;
    }
  }

  // 3. Vite client environment (with prefix fallback)
  try {
    const metaEnv = import.meta.env as Record<string, string | undefined> | undefined;
    if (metaEnv) {
      // Direct match
      if (metaEnv[key] !== undefined) {
        envCache.set(key, metaEnv[key]);
        return metaEnv[key];
      }
      
      // Try BINI_ prefix
      const biniKey = `BINI_${key}`;
      if (metaEnv[biniKey] !== undefined) {
        envCache.set(key, metaEnv[biniKey]);
        return metaEnv[biniKey];
      }
      
      // Try VITE_ prefix
      const viteKey = `VITE_${key}`;
      if (metaEnv[viteKey] !== undefined) {
        envCache.set(key, metaEnv[viteKey]);
        return metaEnv[viteKey];
      }
    }
  } catch {
    // import.meta.env not available
  }

  // Cache undefined to prevent repeated lookups
  envCache.set(key, undefined);
  return undefined;
}

/**
 * Optimized requireEnv with cached error messages
 */
export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (!val) {
    // Create error message once
    const errorMsg = `[bini-env] Missing required environment variable: "${key}".\n` +
      `  → In development: add it to your .env file.\n` +
      `  → In production: add it to your hosting dashboard environment variables.`;
    throw new Error(errorMsg);
  }
  return val;
}

/* ==========================================================================
   Optimized loadEnv with production checks
   ========================================================================== */

let _envLoaded = false;
let _loadPromise: Promise<void> | null = null;

/**
 * Load .env file with memoization and race condition prevention
 */
export async function loadEnv(projectRoot?: string): Promise<void> {
  // Fast path: already loaded
  if (_envLoaded) return;
  
  // Prevent concurrent loads
  if (_loadPromise) {
    return _loadPromise;
  }

  _loadPromise = (async () => {
    try {
      // Deno runtime check - fast path
      if ((globalThis as unknown as { Deno?: DenoNamespace }).Deno) {
        _envLoaded = true;
        return;
      }

      // Node.js runtime check
      if (typeof process === 'undefined' || !process.env) {
        _envLoaded = true;
        return;
      }

      // Production optimization - skip file system operations entirely
      if (process.env.NODE_ENV === 'production') {
        _envLoaded = true;
        return;
      }

      const root = projectRoot ?? process.cwd();
      const envPath = path.join(root, '.env');

      // Check file existence with fs.promises for better performance
      try {
        await fs.promises.access(envPath, fs.constants.R_OK);
      } catch {
        _envLoaded = true;
        return;
      }

      // Dynamic import with caching
      const dotenv = await import('dotenv');
      dotenv.config({ path: envPath });
      
      // Clear cache after loading new env vars
      envCache.clear();
    } catch {
      // Silent fail - requireEnv will handle missing vars
    } finally {
      _envLoaded = true;
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

/* ==========================================================================
   Optimized detectEnvFiles with caching
   ========================================================================== */

let _envFilesCache: DetectedEnvFile[] | null = null;
let _cachedRoot: string = '';

export function detectEnvFiles(projectRoot: string = process.cwd()): DetectedEnvFile[] {
  // Cache results for the same root directory
  if (_envFilesCache && _cachedRoot === projectRoot) {
    return _envFilesCache;
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const candidates = [
    '.env.local',
    `.env.${nodeEnv}.local`,
    `.env.${nodeEnv}`,
    '.env',
  ];

  const found: DetectedEnvFile[] = [];

  // Use for...of with early break if needed
  for (const file of candidates) {
    const filePath = path.join(projectRoot, file);
    try {
      if (fs.existsSync(filePath)) {
        found.push({ name: file, path: filePath });
      }
    } catch {
      // Skip files that can't be accessed
    }
  }

  // Cache the result
  _envFilesCache = found;
  _cachedRoot = projectRoot;
  
  return found;
}

/* ==========================================================================
   Optimized Vite plugin with minimal overhead
   ========================================================================== */

function clearLine(): void {
  // Only write if stdout is a TTY (performance optimization)
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2K\r');
  }
}

function printResolvedUrls(urls: { local: string[]; network: string[] } | null | undefined): void {
  if (!urls) return;
  if (urls.local.length > 0) {
    console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Local:   ${COLORS.CYAN}${urls.local[0]}${COLORS.RESET}`);
  }
  if (urls.network.length > 0) {
    console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Network: ${COLORS.CYAN}${urls.network[0]}${COLORS.RESET}`);
  }
}

/**
 * Production-ready Vite plugin with performance optimizations:
 * - Lazy loading
 * - Caching
 * - Minimal bundle impact
 * - No runtime overhead in production
 */
export function biniEnv(options: Readonly<BiniEnvPluginOptions> = {}): Plugin {
  // Fast path: disabled plugin returns no-op
  if (options.enabled === false) {
    return {
      name: 'vite-plugin-bini-env',
      // Minimal plugin that does nothing
    };
  }

  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { clearViteHeader, logo, envPrefix } = resolvedOptions;

  let resolvedConfig: ResolvedConfig;

  return {
    name: 'vite-plugin-bini-env',
    
    // Optimized config merge
    config(): UserConfig {
      return { envPrefix };
    },

    configResolved(cfg: ResolvedConfig) {
      resolvedConfig = cfg;
    },

    // Optimized server configuration with lazy loading
    configureServer(server) {
      // Defer env loading to avoid blocking server start
      const loadEnvTask = () => {
        void loadEnv(resolvedConfig?.root ?? process.cwd());
      };

      if (server.httpServer) {
        server.httpServer.once('listening', loadEnvTask);
      } else {
        // Use setImmediate for non-blocking execution
        setImmediate(loadEnvTask);
      }

      let serverStarted = false;
      const originalPrintUrls = server.printUrls.bind(server);

      // Only override printUrls if needed
      if (clearViteHeader || logo !== BINI_LOGO) {
        server.printUrls = () => {
          if (serverStarted) return;
          serverStarted = true;

          if (clearViteHeader) clearLine();
          console.log(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (dev)`);

          // Only detect env files in development
          if (process.env.NODE_ENV !== 'production') {
            const found = detectEnvFiles(resolvedConfig?.root);
            if (found.length > 0) {
              const envString = found.map((f) => f.name).join(', ');
              console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${envString}`);
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

    // Preview server with same optimizations
    configurePreviewServer(server) {
      let previewStarted = false;
      const originalPrintUrls = server.printUrls.bind(server);

      if (clearViteHeader || logo !== BINI_LOGO) {
        server.printUrls = () => {
          if (previewStarted) return;
          previewStarted = true;

          if (clearViteHeader) clearLine();
          console.log(`\n  ${COLORS.CYAN}${logo} Bini.js${COLORS.RESET} (preview)`);

          if (process.env.NODE_ENV !== 'production') {
            const found = detectEnvFiles(resolvedConfig?.root);
            if (found.length > 0) {
              const envString = found.map((f) => f.name).join(', ');
              console.log(`  ${COLORS.GREEN}➜${COLORS.RESET}  Environments: ${envString}`);
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