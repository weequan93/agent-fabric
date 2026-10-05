import { defineConfig } from 'vite';
export default defineConfig({ server: {host:'127.0.0.1',port:5173,strictPort:true,fs:{allow:['..']}}, preview:{host:'127.0.0.1',port:5173,strictPort:true}, build:{outDir:'node_modules/.cache/web-dist',emptyOutDir:true}, esbuild:{jsx:'automatic'} });
