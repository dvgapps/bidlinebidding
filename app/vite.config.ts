import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// shown in Preferences so you can tell which build the installed app is running
const sha = (() => {
  try {
    return (process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD').toString()).trim().slice(0, 7)
  } catch {
    return 'dev'
  }
})()
const BUILD = { sha, time: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' }

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(BUILD) },
  // GitHub Pages serves a project site under /<repo>/; the deploy workflow sets VITE_BASE
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Bidline Bidding',
        short_name: 'Bidlines',
        description: 'Private bid-line browser and ranking tool',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '.',
        scope: '.',
        background_color: '#ffffff', // matches the tab bar (was #2b3942); iOS reads this when the app is added to the Home Screen
        theme_color: '#2b3942',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
