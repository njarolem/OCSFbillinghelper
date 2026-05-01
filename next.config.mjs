/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow reading CSV files from /data at runtime via Node fs in API routes.
    serverComponentsExternalPackages: ["papaparse"],
  },
};

export default nextConfig;
