import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The proxy targets are used in Phase 2, when the Node/Socket.IO server exists.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
