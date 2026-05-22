import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'index.html'),
        auctioneer: resolve(__dirname, 'auctioneer.html'),
        controller: resolve(__dirname, 'controller.html'),
        generator: resolve(__dirname, 'generator.html'),
      },
    },
  },
});
