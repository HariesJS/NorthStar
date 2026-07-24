import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // В домашней папке пользователя лежит посторонний package-lock.json — без этой строки
  // Next принимает её за корень воркспейса и неверно резолвит node_modules.
  outputFileTracingRoot: path.join(__dirname),
  images: {
    // иконки приложений отдаются с CDN Google
    remotePatterns: [{ protocol: 'https', hostname: 'play-lh.googleusercontent.com' }],
  },
};

export default nextConfig;
