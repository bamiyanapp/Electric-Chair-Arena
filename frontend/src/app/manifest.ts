import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Electric Chair Arena',
    short_name: 'EC Arena',
    description: 'AIプレイヤー対戦シミュレーター',
    start_url: './',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: 'icon_pwa.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: 'icon2.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
