import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`       -> normal installable PWA (dist/)
// `npm run build:demo`  -> one self-contained HTML file in demo mode (dist-demo/)
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    // relative paths: works on any host or sub-folder (e.g. example.de/rechnung/)
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      demo
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'TaxiRechnung',
              short_name: 'TaxiRechnung',
              description: 'Rechnungen für Taxiunternehmen – schnell, GoBD-konform, mobil.',
              lang: 'de',
              start_url: './',
              scope: './',
              display: 'standalone',
              background_color: '#111111',
              theme_color: '#111111',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
          }),
    ],
    define: { __DEMO_BUILD__: JSON.stringify(demo) },
    build: { outDir: demo ? 'dist-demo' : 'dist' },
  }
})
