
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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