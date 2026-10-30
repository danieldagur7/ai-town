import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Plain JS so `npm run dev` can run it before Vite starts.
import { backendSupervisor } from './scripts/backend.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ai-town',
  // Starts the Convex backend while a game tab is open, stops it when none is
  // (unless the town is on Autorun).
  plugins: [react(), backendSupervisor()],
});
