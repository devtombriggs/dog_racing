import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'

// The Privacy and Terms pages are plain pages in public/ (public/privacy/index.html ...).  nginx serves them
// at /privacy/; Vite would hand back the game instead, so it is pointed at them here too.
const LEGAL_PAGES = /^\/(privacy|terms)\/?(\?.*)?$/;
function toLegalPages(server) {
  server.middlewares.use((req, res, next) => {
    const match = req.url?.match(LEGAL_PAGES);
    if (match) req.url = `/${match[1]}/index.html`;
    next();
  });
}
const legalPages = { name: 'legal-pages', configureServer: toLegalPages, configurePreviewServer: toLegalPages };

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Signing in and the leaderboards (/auth, /api) go to the game server through Vite, as nginx does in Docker,
  // so the sign-in cookie belongs to the page's own address.  (The race connection goes to VITE_SERVER_URL.)
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_SERVER_URL || 'http://localhost:3001';
  const toServer = { target, changeOrigin: false, xfwd: true };
  return {
    plugins: [react(), legalPages],
    server: { proxy: { '/auth': toServer, '/api': toServer } },
    preview: { proxy: { '/auth': toServer, '/api': toServer } },
  };
})
