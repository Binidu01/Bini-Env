import { defineConfig } from 'tsup';

export default defineConfig({
  entry    : ['src/index.ts'],
  format   : ['esm', 'cjs'],
  platform : 'node',
  target   : 'node20',
  dts      : true,
  sourcemap: true,
  clean    : true,
  splitting: false,
  treeshake: true,
  shims    : true,
  external : ['vite', 'dotenv', 'fs', 'path'],
});