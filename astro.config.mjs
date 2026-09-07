// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: "https://facturacontable.gt",
  output: "static",
  integrations: [
    sitemap({
      // .gt es canónico; .com/.net deben hacer 301 → .gt (ver public/_redirects)
      filter: (page) => !page.includes('/404'),
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: "Herramientas Contables GT - SAT & Conciliación",
        short_name: "ContableGT",
        description: "Herramientas contables 100% privadas en tu navegador: XML SAT → PDF y Conciliador CSV → Excel. Sin subir datos.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        background_color: "#ffffff",
        theme_color: "#000000",
        orientation: "any",
        lang: "es-GT",
        categories: ["finance", "business", "productivity"],
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // No precachear AdSense
        navigateFallbackDenylist: [/^https:\/\/pagead2\.googlesyndication\.com/, /^https:\/\/googleads\.g\.doubleclick\.net/],
        runtimeCaching: [
          // HTML — NetworkFirst para contenido fresco, fallback a cache
          {
            urlPattern: ({ request }) => request.destination === 'document' || request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // JS/CSS — StaleWhileRevalidate (incluye xlsx, papaparse, pdfmake chunks)
          {
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          // Imágenes y fuentes — CacheFirst
          {
            urlPattern: ({ request }) => ['image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Google Fonts — StaleWhileRevalidate
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-webfonts', expiration: { maxEntries: 30, maxAgeSeconds: 60*60*24*365 } }
          },
          // AdSense — NetworkOnly (nunca cachear)
          {
            urlPattern: /^https:\/\/pagead2\.googlesyndication\.com\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/googleads\.g\.doubleclick\.net\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/tpc\.googlesyndication\.com\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false
      },
      experimental: {
        directoryAndTrailingSlashHandler: true
      }
    })
  ]
});
