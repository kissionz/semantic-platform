import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: ["@fluentui/react-components"],
        },
      },
    },
  },
});
