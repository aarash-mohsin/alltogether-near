import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function cargoInvocation(root=projectRoot,{platform=process.platform,environment=process.env}={}){
  const workspace=dirname(root),tooling=join(workspace,'.tooling'),cargoHome=join(tooling,'cargo');
  const executable=join(cargoHome,'bin',platform==='win32'?'cargo.exe':'cargo');
  const env={...environment};
  if(!existsSync(executable))return {executable:'cargo',env,local:false};
  env.CARGO_HOME=cargoHome;env.RUSTUP_HOME=join(tooling,'rustup');
  const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')??'PATH';
  const binaries=[join(cargoHome,'bin')];
  const mingw=join(tooling,'mingw','mingw64','bin');if(existsSync(mingw)){binaries.push(mingw);env.CMAKE_GENERATOR='MinGW Makefiles';}
  const cmakeRoot=join(tooling,'cmake');if(existsSync(cmakeRoot)){const entry=readdirSync(cmakeRoot,{withFileTypes:true}).find(e=>e.isDirectory()&&e.name.startsWith('cmake-'));if(entry)binaries.push(join(cmakeRoot,entry.name,'bin'));}
  env[pathKey]=binaries.join(platform==='win32'?';':':')+(env[pathKey]?(platform==='win32'?';':':')+env[pathKey]:'');
  return {executable,env,local:true};
}
export function contractJobs(root=projectRoot,command){
  const name=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).name;
  const cwd=join(root,'contract');
  if(command==='test')return [{cwd,args:['test','--workspace','--locked']}];
  if(command!=='build')throw new Error('Use test or build');
  const member=name==='alltogether'?'test-token':name==='archivepass'?'receiver':null;
  if(!member)throw new Error('Unsupported contract package');
  const primary=name==='alltogether'?'alltogether_escrow':'archivepass',secondary=name==='alltogether'?'alltogether_test_usd':'archivepass_receiver';
  return [{cwd,args:['near','build','non-reproducible-wasm','--locked','--no-abi','--out-dir',join(cwd,'target','near')],artifact:join(cwd,'target','near',primary+'.wasm')},{cwd:join(cwd,member),args:['near','build','non-reproducible-wasm','--locked','--no-abi','--out-dir',join(cwd,'target','near',secondary)],artifact:join(cwd,'target','near',secondary,secondary+'.wasm')}];
}
export function runContracts(command,{root=projectRoot,runner=spawnSync}={}){
  const cargo=cargoInvocation(root);
  for(const job of contractJobs(root,command)){
    const result=runner(cargo.executable,job.args,{cwd:job.cwd,env:cargo.env,stdio:'inherit',shell:false});
    if(result.error)throw result.error;
    if(result.status!==0)return result.status??1;
    if(job.artifact){const bytes=readFileSync(job.artifact);if(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)throw new Error('Expected actual WASM artifact: '+job.artifact);console.log(JSON.stringify({artifact:relativeArtifact(root,job.artifact),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),build:'optimized non-reproducible-wasm; no bit-identical independent-build claim'}));}
  }
  return 0;
}
function relativeArtifact(root,path){return path.slice(root.length).replaceAll('\\','/').replace(/^\/+/,'');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.exitCode=runContracts(process.argv[2]);}catch(error){console.error(error.message);process.exitCode=1;}}

