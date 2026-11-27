import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { marketingPages } from "./scripts/marketing-pages";

export default defineConfig({
  plugins: [react(), tailwindcss(), marketingPages()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
