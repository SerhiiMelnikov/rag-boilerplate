import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Trace only the files the server actually needs into .next/standalone, so the
  // runtime image carries no dev dependencies and no full node_modules.
  output: "standalone",
  serverExternalPackages: ["unpdf", "mammoth"],
  devIndicators: false,
};

export default nextConfig;
