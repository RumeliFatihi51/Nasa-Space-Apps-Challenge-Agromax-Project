import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { workflow } from "workflow/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
const commercial = process.env.AGROMAX_RUNTIME === "commercial";
export default defineConfig({
  server: { watch: { ignored: ["**/data/**", "**/.output/**", "**/dist/**", "**/.agromax-build/**"] } },
  plugins: [
    viteStaticCopy({ targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map(name => ({
      src: "node_modules/cesium/Build/Cesium/" + name,
      dest: "cesium", rename: { stripBase: 4 },
    })) }),
    ...(commercial ? [nitro(), workflow()] : []),
  ],
  ...(commercial
    ? {
        nitro: {
          serverDir: "runtime",
          serverAssets: [{ baseName: "fonts", dir: "public/fonts" }],
          compatibilityDate: "2026-11-01",
          preset: process.env.VERCEL ? "vercel" : "node-server",
        },
      }
    : {}),
});
