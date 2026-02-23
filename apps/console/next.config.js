/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence noisy build output in CI
  output: 'standalone',
};

module.exports = nextConfig;
