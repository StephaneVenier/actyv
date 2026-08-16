import type { NextConfig } from 'next';

const supabaseImageHost = (() => {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!configuredUrl) {
    return null;
  }

  try {
    return new URL(configuredUrl).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/exercise-images/**' },
      ...(supabaseImageHost
        ? [{ protocol: 'https' as const, hostname: supabaseImageHost, pathname: '/storage/v1/object/public/exercise-images/**' }]
        : []),
    ],
  },
};

export default nextConfig;
