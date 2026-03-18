import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname),
  appType: 'spa',
  server: {
    host: true,
    port: 5173
  }
});
