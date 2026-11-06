import {existsSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,constants} from 'node:fs';
import {resolve,relative,dirname,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectRoot,parseOptions,confined,verifyBackup,inspectData} from './backup.mjs';
export function restoreProject({root=projectRoot,project,backup,dest,servicesStopped=false}){
  if(!servicesStopped)throw new Error('Stop all writers, then pass --services-stopped');
  if(!backup||!dest)throw new Error('Provide --backup and a new --dest directory');
  const backupRoot=confined(root,backup,{mustExist:true}),destRoot=confined(root,dest);
  if(existsSync(destRoot))throw new Error('Restore destination already exists; refusing overwrite');
  const rel=relative(backupRoot,destRoot);if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))throw new Error('Restore destination must be separate from backup');
  const {manifest,manifestSha256}=verifyBackup(backupRoot,project);
  mkdirSync(destRoot,{recursive:true});
  for(const file of manifest.files){const target=confined(destRoot,file.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(confined(backupRoot,file.path,{mustExist:true}),target,constants.COPYFILE_EXCL);}
  const inspected=inspectData(destRoot,project);if(JSON.stringify(inspected)!==JSON.stringify(manifest.files))throw new Error('Restored data does not match verified manifest');
  writeFileSync(resolve(destRoot,'restore-receipt.json'),JSON.stringify({format:'project-data-restore-v1',project,restored_at:new Date().toISOString(),manifest_sha256:manifestSha256,files:manifest.files.length,operator_token_restored:false,note:'Application startup creates a new operator credential when required. Preserve keeper identity/mode/API binding.'},null,2)+'\n',{flag:'wx'});
  return {project,dest:relative(root,destRoot),files:manifest.files.length,manifest_sha256:manifestSha256,operator_token_restored:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const options=parseOptions(process.argv.slice(2),['--backup','--dest']);const project=JSON.parse(readFileSync(resolve(projectRoot,'package.json'),'utf8')).name;console.log(JSON.stringify(restoreProject({...options,project}),null,2));}catch(error){console.error('Restore refused: '+error.message);process.exitCode=1;}
}

