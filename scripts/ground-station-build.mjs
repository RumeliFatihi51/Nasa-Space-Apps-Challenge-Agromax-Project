import {build} from 'vite';
import tailwind from '@tailwindcss/vite';
import {resolve} from 'node:path';
await build({configFile:false,root:resolve('apps/ground-station'),base:'/ground-station/',
  envDir:resolve('apps/ground-station'),plugins:[tailwind()],
  define:{__GOOGLE_MAPS_API_KEY__:JSON.stringify(process.env.VITE_GOOGLE_MAPS_API_KEY||'')},
  build:{outDir:resolve('public/ground-station'),emptyOutDir:true,chunkSizeWarningLimit:1800}});
