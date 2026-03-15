/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only for production build (Tauri). Dev server allows dynamic routes.
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  reactStrictMode: true,
  // Avoid "Converting circular structure to JSON" when using eslint-config-next with legacy .eslintrc
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
