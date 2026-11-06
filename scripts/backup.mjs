import {existsSync,lstatSync,realpathSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,constants} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function fail(message){throw new Error(message);}
export function confined(root,path,{mustExist=false,allowRoot=false}={}){
  const base=resolve(root),target=resolve(base,path),rel=relative(base,target);
  if((!allowRoot&&!rel)||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('Path must remain inside the project root');
  const baseInfo=lstatSync(base);if(baseInfo.isSymbolicLink()||realpathSync(base)!==base)fail('Project root must be canonical and not a symlink/reparse point');
  let current=base;
  for(const part of rel.split(sep).filter(Boolean)){
    current=resolve(current,part);
    if(existsSync(current)){const stat=lstatSync(current);if(stat.isSymbolicLink()||realpathSync(current)!==current)fail('Symlink/reparse path is not permitted');}
    else if(mustExist)fail('Required path does not exist: '+rel);
  }
  return target;
}
export function parseOptions(args,allowed){
  const out={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--services-stopped'){out.servicesStopped=true;continue;}
    if(!allowed.includes(key)||!args[i+1]||args[i+1].startsWith('--'))fail('Invalid or missing option: '+key);
    out[key.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=args[++i];
  }
  return out;
}
function readDb(root,path,kind){
  const full=confined(root,path,{mustExist:true});
  if(!lstatSync(full).isFile())fail('Expected a regular SQLite file: '+path);
  for(const suffix of ['-wal','-journal'])if(existsSync(full+suffix)&&lstatSync(full+suffix).size>0)fail('Database has a nonempty '+suffix+'; stop services and checkpoint cleanly before backup');
  const db=new DatabaseSync(full,{readOnly:true});
  try{
    const integrity=db.prepare('PRAGMA integrity_check').all();
    if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')fail('SQLite integrity check failed: '+path);
    if(db.prepare('PRAGMA foreign_key_check').all().length)fail('SQLite foreign key check failed: '+path);
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    const required=kind==='alltogether'?['accounts','campaigns','admissions','positions','credits','attempts','transfer_results','proposals','events','idempotency','custody','meta']:kind==='app'?['migrations','drafts','assets','commitments','payments','outbox','events','idempotency','observations','settings']:['bindings','imports','actions','state'];
    if(required.some(name=>!tables.has(name)))fail('SQLite schema tables do not match '+kind+': '+path);
    const columns=kind==='alltogether'?{accounts:['id','payload'],campaigns:['id','state','payload'],admissions:['campaign_id','account_id'],positions:['campaign_id','account_id','leg_id','payload'],credits:['id','campaign_id','owner','payload'],attempts:['id','campaign_id','credit_id','status','payload'],transfer_results:['attempt_id','payload'],proposals:['id','campaign_id','payload'],events:['id','campaign_id','payload'],idempotency:['actor','key','fingerprint','status','response_json'],custody:['id','balance','fixture_issued'],meta:['key','value']}:kind==='app'?{migrations:['version'],drafts:['id','body'],assets:['id','body'],commitments:['asset_id','id','provider_id','slot','body'],payments:['asset_id','id','body'],outbox:['asset_id','id','outcome','delivery'],events:['id','asset_id','body'],idempotency:['scope','request_id','body_hash','result'],observations:['id','asset_id','body'],settings:['key','value']}:{bindings:['key','value'],imports:['asset_id','body'],actions:['action_key','request_id','result','error'],state:['key','value']};
    for(const [table,names]of Object.entries(columns)){const actual=new Set(db.prepare('PRAGMA table_info('+table+')').all().map(row=>row.name));if(names.some(column=>!actual.has(column)))fail('SQLite schema columns do not match '+kind+': '+table);}
    const userVersion=Number(db.prepare('PRAGMA user_version').get().user_version);
    if(kind==='alltogether'&&userVersion!==1)fail('Unsupported AllTogether schema version');
    if(kind==='app'){const versions=db.prepare('SELECT version FROM migrations ORDER BY version').all().map(r=>Number(r.version));if(versions.length!==1||versions[0]!==1)fail('Unsupported ArchivePass schema version');}
    if(kind==='keeper'){const bindings=db.prepare('SELECT key,value FROM bindings').all();for(const key of ['provider_id','mode','api_origin'])if(!bindings.some(r=>r.key===key&&typeof r.value==='string'&&r.value.length))fail('Keeper binding is missing: '+key);}
    const references=[];
    if(kind==='app')for(const table of ['assets','drafts'])for(const row of db.prepare('SELECT body FROM '+table).all()){const object=JSON.parse(row.body);references.push({manifest:object.manifest,required:true});}
    if(kind==='keeper')for(const row of db.prepare('SELECT body FROM imports').all()){const object=JSON.parse(row.body);references.push({manifest:object.manifest,required:object.status==='Ready'});}
    return {schema:{kind,user_version:userVersion,version:kind==='app'?1:null},references};
  }finally{db.close();}
}
export function inspectData(root,project){
  const descriptions=project==='alltogether'?[['alltogether.sqlite','alltogether']]:project==='archivepass'?[['app/archivepass.sqlite','app'],['keeper-a/keeper.sqlite','keeper'],['keeper-b/keeper.sqlite','keeper']]:fail('Unknown project');
  const files=new Map();
  const add=(path,kind,schema=null)=>{const full=confined(root,path,{mustExist:true});const info=lstatSync(full);if(!info.isFile())fail('Only regular files are supported');const bytes=readFileSync(full);files.set(path,{path,kind,size:bytes.length,sha256:sha256(bytes),...(schema?{schema}:{})});return bytes;};
  for(const [path,kind]of descriptions){
    const {schema,references}=readDb(root,path,kind);add(path,'sqlite',schema);
    for(const reference of references){
      const manifest=reference.manifest;
      if(!manifest||!/^[a-f0-9]{64}$/.test(manifest.file_sha256)||!/^[1-9][0-9]*$/.test(manifest.size_bytes)||BigInt(manifest.size_bytes)>16777216n)fail('Invalid persisted blob identity');
      const blob=dirname(path).split(sep).join('/')+'/blobs/'+manifest.file_sha256;
      const full=confined(root,blob);
      if(!existsSync(full)){if(reference.required)fail('Required immutable blob is missing: '+blob);continue;}
      const bytes=add(blob,'blob');
      if(bytes.length!==Number(manifest.size_bytes)||sha256(bytes)!==manifest.file_sha256)fail('Immutable blob digest/size mismatch: '+blob);
    }
  }
  return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export function assertFilePath(project,path){
  if(typeof path!=='string'||path.includes('\\')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'))fail('Unsafe backup manifest path');
  const valid=project==='alltogether'?path==='alltogether.sqlite':/^(app\/archivepass\.sqlite|keeper-[ab]\/keeper\.sqlite|(app|keeper-[ab])\/blobs\/[a-f0-9]{64})$/.test(path);
  if(!valid)fail('Manifest path is outside the explicit data allowlist');
}
export function verifyBackup(root,project){
  const manifestFile=confined(root,'manifest.json',{mustExist:true}),digestFile=confined(root,'manifest.sha256',{mustExist:true});
  const bytes=readFileSync(manifestFile);if(bytes.length>4*1024*1024)fail('Backup manifest is oversized');
  if(readFileSync(digestFile,'utf8').trim()!==sha256(bytes))fail('Backup manifest SHA-256 mismatch');
  const manifest=JSON.parse(bytes);
  if(manifest.format!=='project-data-backup-v1'||manifest.project!==project||manifest.services_stopped_attested!==true||!Array.isArray(manifest.files)||manifest.files.length>16384)fail('Backup manifest identity is invalid');
  const seen=new Set();
  for(const file of manifest.files){
    assertFilePath(project,file.path);if(seen.has(file.path))fail('Duplicate backup manifest path');seen.add(file.path);
    if(!Number.isSafeInteger(file.size)||file.size<0||!/^[a-f0-9]{64}$/.test(file.sha256))fail('Invalid backup file identity');
    const path=confined(root,file.path,{mustExist:true});if(!lstatSync(path).isFile())fail('Backup file is not regular');
    const body=readFileSync(path);if(body.length!==file.size||sha256(body)!==file.sha256)fail('Backup file SHA-256/size mismatch: '+file.path);
  }
  const inspected=inspectData(root,project);
  if(JSON.stringify(inspected)!==JSON.stringify(manifest.files))fail('Backup schema or referenced-file set differs from manifest');
  return {manifest,manifestSha256:sha256(bytes)};
}
function distinct(a,b){const rel=relative(a,b);return rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);}
export function backupProject({root=projectRoot,project,source='data',output,servicesStopped=false}){
  if(!servicesStopped)fail('Stop all writers, then pass --services-stopped; this is a consistent multi-database backup prerequisite');
  if(!output)fail('Provide a unique --output directory');
  const sourceRoot=confined(root,source,{mustExist:true}),outputRoot=confined(root,output);
  if(existsSync(outputRoot))fail('Backup output already exists; refusing overwrite');
  if(sourceRoot===outputRoot||distinct(sourceRoot,outputRoot)||distinct(outputRoot,sourceRoot))fail('Backup source and output must not contain each other');
  const files=inspectData(sourceRoot,project);
  mkdirSync(outputRoot,{recursive:true});
  for(const file of files){assertFilePath(project,file.path);const src=confined(sourceRoot,file.path,{mustExist:true}),dest=confined(outputRoot,file.path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(src,dest,constants.COPYFILE_EXCL);if(sha256(readFileSync(dest))!==file.sha256||sha256(readFileSync(src))!==file.sha256)fail('Data changed during backup; incomplete output must not be used');}
  const manifest={format:'project-data-backup-v1',project,created_at:new Date().toISOString(),services_stopped_attested:true,excluded:['operator-token','.env','.secrets','unreferenced files','runtime WAL/SHM/journal'],files};
  const body=JSON.stringify(manifest,null,2)+'\n';writeFileSync(resolve(outputRoot,'manifest.json'),body,{flag:'wx'});writeFileSync(resolve(outputRoot,'manifest.sha256'),sha256(body)+'\n',{flag:'wx'});verifyBackup(outputRoot,project);
  return {project,output:relative(root,outputRoot),files:files.length,manifest_sha256:sha256(body),note:'No operator token, environment file or wallet credential was copied. Keep ledger backups private.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const options=parseOptions(process.argv.slice(2),['--source','--output']);const project=JSON.parse(readFileSync(resolve(projectRoot,'package.json'),'utf8')).name;console.log(JSON.stringify(backupProject({...options,project}),null,2));}catch(error){console.error('Backup refused: '+error.message);process.exitCode=1;}
}

