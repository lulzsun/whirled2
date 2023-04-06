import { defineConfig } from 'vite'
import Terminal from 'vite-plugin-terminal'
import react from '@vitejs/plugin-react-swc'
import ssr from 'vite-plugin-ssr/plugin'

// https://vitejs.dev/config/
export default defineConfig({
  root: 'client',
  plugins: [
    react(), 
    ssr({ prerender: true }),
    Terminal({ console: 'terminal', output: ['terminal', 'console'] }), 
  ],
  build: {
    outDir: '../server/pb_public'
  }
})
