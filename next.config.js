/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only for production build (Tauri). Dev server allows dynamic routes.
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  reactStrictMode: true,
};

module.exports = nextConfig;
