import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
//
// Default build emits normal hashed assets (dist/index.html + dist/assets/*)
// so the strict production CSP (`script-src 'self'`, no inline scripts) and
// the /assets/ caching rules in nginx work as intended. The single-file
// variant (everything inlined into index.html) is opt-in via
// VITE_SINGLE_FILE=1 for offline/demo distribution — it is NOT compatible
// with `script-src 'self'` because the app bundle is an inline <script>.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITE_SINGLE_FILE === '1' ? [viteSingleFile()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev convenience: /api requests go straight to the local FastAPI
      // backend (same origin from the browser's perspective, so no CORS).
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
