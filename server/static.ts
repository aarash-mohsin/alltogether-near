import type {IncomingMessage,ServerResponse} from 'node:http';
import {existsSync,lstatSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,extname,sep,dirname} from 'node:path';
import {DomainError} from './domain.ts';

export function serveBuiltApp(req:IncomingMessage,res:ServerResponse,root:string,path:string):void {
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  if(path.includes('\0')||path.includes('\\')||path.split('/').some(segment=>segment.startsWith('.')))throw new DomainError('NOT_FOUND','File not found.',404);
  const directory=resolve(root);
  if(!existsSync(directory)||lstatSync(directory).isSymbolicLink())throw new DomainError('UI_UNAVAILABLE','The built interface is unavailable. Run the production build.',503);
  const realRoot=realpathSync(directory),candidate=resolve(directory,`.${path}`);
  if(candidate!==directory&&!candidate.startsWith(directory+sep))throw new DomainError('NOT_FOUND','File not found.',404);
  const isFile=existsSync(candidate)&&statSync(candidate).isFile();
  const file=isFile?candidate:(path==='/'||!extname(path)?resolve(directory,'index.html'):null);
  if(!file||!existsSync(file)||!statSync(file).isFile())throw new DomainError('NOT_FOUND','File not found.',404);
  for(let node=file;;node=dirname(node)){if(lstatSync(node).isSymbolicLink())throw new DomainError('NOT_FOUND','File not found.',404);if(node===directory)break;if(node===dirname(node))throw new DomainError('NOT_FOUND','File not found.',404);}
  const actual=realpathSync(file);if(!actual.startsWith(realRoot+sep))throw new DomainError('NOT_FOUND','File not found.',404);
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
  const info=statSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Cache-Control':/-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(file)?'public, max-age=31536000, immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(file));
}
