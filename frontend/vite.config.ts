import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chatviz': 'http://localhost:7890',
      '/v1': 'http://localhost:7890',
      '/api': 'http://localhost:7890',
    },
  },
  build: {
    outDir: 'dist',
  },
})
