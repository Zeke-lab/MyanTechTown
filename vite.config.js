
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/MyanTechTown/', // Set base path for GitHub Pages
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    watch: {
      // Ignore common high-traffic system folders
      ignored: [
        '**/AppData/**',
        '**/anaconda3/**',
        '**/node_modules/**',
        '**/.git/**'
      ]
    }
  }
})