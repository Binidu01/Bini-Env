import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [
    "vite",
    "dotenv",
    "fs",
    "path",
  ],
  esbuildOptions(options) {
    options.platform = "node";
    options.target = "es2022";
  },
});