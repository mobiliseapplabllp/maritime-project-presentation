import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // the vendored copy ships without its dist/ in this snapshot — alias to a
      // graceful shim so the build passes; LiveTwin surfaces a friendly error.
      "@nvidia/omniverse-webrtc-streaming-library":
        fileURLToPath(new URL("./src/lib/omniverseShim.js", import.meta.url)),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    host: true,   // bind all interfaces (IPv4 + IPv6) so localhost/127.0.0.1/::1 all resolve

    proxy: {
      "/api": { target: "http://127.0.0.1:8010", changeOrigin: true },
    },
  },
});
