import {spawnSync} from 'node:child_process';
const run=args=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);};
if(process.argv.includes('--snapshot'))run(['scripts/site-snapshot.mjs']);
run(['node_modules/vite/bin/vite.js','build','--config','vite.site.config.ts']);
