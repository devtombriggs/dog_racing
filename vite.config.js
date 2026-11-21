import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Signing in and the leaderboards (/auth, /api) go to the game server through Vite, as nginx does in Docker,
  // so the sign-in cookie belongs to the page's own address.  (The race connection goes to VITE_SERVER_URL.)
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_SERVER_URL || 'http://localhost:3001';
  const toServer = { target, changeOrigin: false, xfwd: true };
  return {
    plugins: [react()],
    server: { proxy: { '/auth': toServer, '/api': toServer } },
    preview: { proxy: { '/auth': toServer, '/api': toServer } },
  };
})
