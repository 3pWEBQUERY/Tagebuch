import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kein statischer Export mehr: die App spricht über /api/entries mit Postgres
  // und braucht dafür eine Node-Laufzeit.
  images: { unoptimized: true },
  // Das Dev-Overlay sitzt sonst genau auf der Tableiste.
  devIndicators: false,
};

export default nextConfig;
