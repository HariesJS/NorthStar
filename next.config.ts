import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // В домашней папке пользователя лежит посторонний package-lock.json — без этой строки
  // Next принимает её за корень воркспейса и неверно резолвит node_modules.
  outputFileTracingRoot: path.join(__dirname),
  // better-sqlite3 — нативный модуль, его нельзя бандлить, только require из node_modules
  serverExternalPackages: ['better-sqlite3'],
  // serverExternalPackages не распространяется на компиляцию instrumentation-хука,
  // поэтому там better-sqlite3 приходится помечать внешним отдельно.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'better-sqlite3'];
    }
    return config;
  },
  images: {
    // иконки приложений отдаются с CDN Google
    remotePatterns: [{ protocol: 'https', hostname: 'play-lh.googleusercontent.com' }],
  },
};

export default nextConfig;
