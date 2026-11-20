import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production Optimized Vite configuration with smart code-splitting & chunk caching
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@supabase")) {
              return "supabase-vendor";
            }
            if (id.includes("lucide-react")) {
              return "icons-vendor";
            }
            if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("dompurify")) {
              return "pdf-vendor";
            }
            return "vendor";
          }
        }
      }
    }
  }
});
