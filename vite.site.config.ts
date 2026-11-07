import {defineConfig} from 'vite';
// The hosted, static live page (GitHub Pages). It reads NEAR testnet RPC from the browser; no server, no keys.
export default defineConfig({root:'site',base:'./',publicDir:'public',build:{outDir:'../dist/site',emptyOutDir:true,assetsInlineLimit:0},server:{host:'127.0.0.1',port:Number(process.env.ALLTOGETHER_SITE_PORT??5176),strictPort:true,fs:{allow:['..']}}});
