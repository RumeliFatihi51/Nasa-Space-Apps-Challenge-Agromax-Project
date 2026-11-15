process.env.AGROMAX_RUNTIME = "commercial";
await import('./ground-station-build.mjs');
const { createBuilder } = await import("vite");
const builder = await createBuilder();
await builder.buildApp();
