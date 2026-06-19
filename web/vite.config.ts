import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the dashboard into ../public/app so the existing Node server serves it
// statically (no build step on the deploy box). base=/app/ scopes bundled asset
// URLs; the engine's art icons are referenced absolutely from /art (served from
// public/art), so they're unaffected by base.
export default defineConfig({
  plugins: [react()],
  base: "/app/",
  build: {
    outDir: "../public/app",
    emptyOutDir: true,
  },
});
