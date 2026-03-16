import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      port: 1420,
      strictPort: true,
      proxy: {
        "/jsonrpc": {
          target:       "http://localhost:8069",
          changeOrigin: true,
          secure:       false,
        },
        "/web": {
          target:       "http://localhost:8069",
          changeOrigin: true,
          secure:       false,
        },
        "/focusnfe": {
          target:       env.VITE_FOCUSNFE_URL,
          changeOrigin: true,
          secure:       true,
          rewrite:      (path) => path.replace(/^\/focusnfe/, ""),
        },
      },
    },
  };
});