
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: "./", // Changed for GitHub Pages compatibility
  plugins: [react()],
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