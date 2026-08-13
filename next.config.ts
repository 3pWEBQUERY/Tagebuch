import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rein clientseitige App: statischer Export, damit sie von jedem
  // beliebigen Static-Host (oder offline aus dem SW-Cache) läuft.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
