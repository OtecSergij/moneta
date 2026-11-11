import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // image stays small and doesn't need the full node_modules at runtime.
  output: "standalone",
  // Lets a phone on the home Wi-Fi open the dev server by its LAN IP.
  allowedDevOrigins: ["192.168.*.*", "172.20.10.*"],
};

export default nextConfig;
