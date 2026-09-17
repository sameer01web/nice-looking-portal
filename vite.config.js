import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite configuration using native import.meta.env variable handling
export default defineConfig({
  plugins: [react()]
});



