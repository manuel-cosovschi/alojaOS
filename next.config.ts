import type { NextConfig } from 'next';

const config: NextConfig = {
  // Las fotos de las unidades viven en el Storage de Supabase, que sirve desde
  // el dominio del proyecto.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
};

export default config;
