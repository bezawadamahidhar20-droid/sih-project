import path from "path";
import { fileURLToPath } from "url";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Guard for the single-file build: when the dist/index.html is opened directly
// from disk (file://), browsers block the inline ES module and show a blank
// page. This classic inline script runs on file:// and shows a helpful message
// instead of a white screen.
function fileProtocolGuard(): Plugin {
  return {
    name: "file-protocol-guard",
    transformIndexHtml(html) {
      const guard = `<script>
(function () {
  if (window.location.protocol === "file:") {
    var root = document.getElementById("root");
    if (root) {
      root.innerHTML =
        '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:96px auto;padding:40px 32px;text-align:center;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.06)">' +
        '<h1 style="font-size:22px;color:#0f172a;margin:0 0 12px">MediScan AI</h1>' +
        '<p style="color:#475569;font-size:14px;line-height:1.7;margin:0">This file must be served over HTTP — opening it directly from disk blocks the app\'s scripts.</p>' +
        '<p style="color:#64748b;font-size:13px;line-height:1.7;margin:16px 0 0">Run <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">npm run preview</code> inside the frontend folder, or start the full stack with <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">docker compose up --build</code>.</p>' +
        '</div>';
    }
  }
})();
</script>`;
      return html.replace(
        '<div id="root"></div>',
        `<div id="root"></div>${guard}`
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), fileProtocolGuard()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
