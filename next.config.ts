import type { NextConfig } from "next";

const codespaceOrigin = process.env.CODESPACE_NAME
  ? `${process.env.CODESPACE_NAME}-3000.app.github.dev`
  : undefined;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/help": ["./docs/USER_GUIDE.md"],
  },
  ...(codespaceOrigin
    ? {
        allowedDevOrigins: [codespaceOrigin],
        experimental: {
          serverActions: {
            allowedOrigins: [
              codespaceOrigin,
              ...(process.env.NODE_ENV === "development"
                ? ["localhost:3000"]
                : []),
            ],
          },
        },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
