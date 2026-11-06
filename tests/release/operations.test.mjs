import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {resolve,join,sep,basename} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {backupProject,verifyBackup,sha256,confined} from '../../scripts/backup.mjs';
import {restoreProject} from '../../scripts/restore.mjs';
import {cargoInvocation,contractJobs,runContracts} from '../../scripts/contract.mjs';
const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
const project=JSON.parse(readFileSync(join(projectRoot,'package.json'),'utf8')).name;
const {Store}=await import(project==='alltogether'?'../../server/store.ts':'../../server/db.ts');
function makeDb(path,sql){mkdirSync(resolve(path,'..'),{recursive:true});const db=new DatabaseSync(path);db.exec(sql);db.close();}
function fixture(t){
  const root=mkdtempSync(join(projectRoot,'tests','release','.tmp-'));t.after(()=>{const full=resolve(root),allowed=resolve(projectRoot,'tests','release')+sep;assert.ok(full.startsWith(allowed)&&basename(full).startsWith('.tmp-'));rmSync(full,{recursive:true,force:true});});
  const source=join(root,'data');mkdirSync(source);
  if(project==='alltogether'){
    const store=new Store(join(source,'alltogether.sqlite'));store.db.prepare('INSERT INTO accounts(id,payload) VALUES(?,?)').run('persistent-account',JSON.stringify({id:'persistent-account'}));store.db.close();
  }else{
    const bytes=Buffer.from('An actual immutable public backup fixture.'),digest=sha256(bytes),body=JSON.stringify({manifest:{file_sha256:digest,size_bytes:String(bytes.length)}});
    const store=new Store(join(source,'app','archivepass.sqlite'));store.db.close();
    const db=new DatabaseSync(join(source,'app','archivepass.sqlite'));db.prepare("INSERT INTO assets(id,body) VALUES('asset-fixture',?)").run(body);db.prepare("INSERT INTO drafts(id,body) VALUES('draft-fixture',?)").run(body);db.close();
    for(const label of ['app','keeper-a','keeper-b']){
      mkdirSync(join(source,label,'blobs'),{recursive:true});writeFileSync(join(source,label,'blobs',digest),bytes);
      if(label!=='app'){makeDb(join(source,label,'keeper.sqlite'),"CREATE TABLE bindings(key TEXT,value TEXT);CREATE TABLE imports(asset_id TEXT,body TEXT);CREATE TABLE actions(action_key TEXT,request_id TEXT,result TEXT,error TEXT);CREATE TABLE state(key TEXT,value TEXT);INSERT INTO bindings VALUES('provider_id','keeper.testnet'),('mode','local'),('api_origin','http://127.0.0.1:8788');");const keeper=new DatabaseSync(join(source,label,'keeper.sqlite'));keeper.prepare("INSERT INTO imports(asset_id,body) VALUES('asset-fixture',?)").run(JSON.stringify({...JSON.parse(body),status:'Ready'}));keeper.close();}
    }
  }
  writeFileSync(join(source,'operator-token'),'excluded-private-local-token');writeFileSync(join(source,'.env'),'EXCLUDED=secret');mkdirSync(join(source,'.secrets'));writeFileSync(join(source,'.secrets','keys.json'),'excluded-wallet-key');
  const options={root,project,source:'data',output:'backups/snapshot',servicesStopped:true};return{root,source,options,db:project==='alltogether'?'alltogether.sqlite':'app/archivepass.sqlite'};
}
test('stopped-services backup and restore preserve every allowlisted database/blob with integrity manifest',t=>{
  const f=fixture(t),before=readFileSync(join(f.source,f.db));const result=backupProject(f.options);assert.ok(result.files>0);const backup=join(f.root,'backups','snapshot');const verified=verifyBackup(backup,project);assert.equal(verified.manifestSha256,result.manifest_sha256);
  assert.equal(existsSync(join(backup,'operator-token')),false);assert.equal(existsSync(join(backup,'.env')),false);assert.equal(existsSync(join(backup,'.secrets')),false);
  const restored=restoreProject({root:f.root,project,backup:'backups/snapshot',dest:'restored/new',servicesStopped:true});assert.equal(restored.operator_token_restored,false);assert.deepEqual(readFileSync(join(f.source,f.db)),before);assert.deepEqual(readFileSync(join(f.root,'restored/new',f.db)),before);assert.ok(existsSync(join(f.root,'restored/new','restore-receipt.json')));
  for(const file of verified.manifest.files)assert.equal(sha256(readFileSync(join(f.root,'restored/new',file.path))),file.sha256);
});
test('no stopped-services attestation, existing targets, and outside/nested paths are refused without overwriting',t=>{
  const f=fixture(t);assert.throws(()=>backupProject({...f.options,servicesStopped:false}),/Stop all writers/);assert.throws(()=>backupProject({...f.options,output:'../outside'}),/inside the project/);assert.throws(()=>backupProject({...f.options,output:'data/backup'}),/contain each other/);backupProject(f.options);assert.throws(()=>backupProject(f.options),/already exists/);mkdirSync(join(f.root,'occupied'));writeFileSync(join(f.root,'occupied','keep'),'preserve');assert.throws(()=>restoreProject({root:f.root,project,backup:'backups/snapshot',dest:'occupied',servicesStopped:true}),/already exists/);assert.equal(readFileSync(join(f.root,'occupied','keep'),'utf8'),'preserve');assert.throws(()=>restoreProject({root:f.root,project,backup:'backups/snapshot',dest:'new',servicesStopped:false}),/Stop all writers/);
});
test('corrupt backup bytes are rejected before a restore destination is created',t=>{
  const f=fixture(t);backupProject(f.options);writeFileSync(join(f.root,'backups/snapshot',f.db),'corrupted');assert.throws(()=>restoreProject({root:f.root,project,backup:'backups/snapshot',dest:'restored/corrupt',servicesStopped:true}),/SHA-256/);assert.equal(existsSync(join(f.root,'restored/corrupt')),false);
});
test('tampered manifest, traversal and cross-project identity are rejected before copying',t=>{
  const f=fixture(t);backupProject(f.options);const backup=join(f.root,'backups/snapshot');writeFileSync(join(backup,'manifest.sha256'),'0'.repeat(64));assert.throws(()=>verifyBackup(backup,project),/manifest SHA-256/);const manifest=JSON.parse(readFileSync(join(backup,'manifest.json'),'utf8'));manifest.files[0].path='../secret';const bytes=JSON.stringify(manifest);writeFileSync(join(backup,'manifest.json'),bytes);writeFileSync(join(backup,'manifest.sha256'),sha256(bytes));assert.throws(()=>restoreProject({root:f.root,project,backup:'backups/snapshot',dest:'restored/unsafe',servicesStopped:true}),/Unsafe.*path/);assert.equal(existsSync(join(f.root,'restored/unsafe')),false);assert.throws(()=>verifyBackup(backup,project==='alltogether'?'archivepass':'alltogether'),/identity/);
});
test('nonempty WAL and unsupported schemas are refused rather than producing a partial confident snapshot',t=>{
  const f=fixture(t);writeFileSync(join(f.source,f.db+'-wal'),'active');assert.throws(()=>backupProject(f.options),/nonempty/);rmSync(join(f.source,f.db+'-wal'));const db=new DatabaseSync(join(f.source,f.db));db.exec(project==='alltogether'?'PRAGMA user_version=99':'INSERT INTO migrations VALUES(99)');db.close();assert.throws(()=>backupProject(f.options),/Unsupported.*schema/);assert.equal(existsSync(join(f.root,'backups/snapshot')),false);
});
test('symlink or Windows junction sources and output ancestors cannot escape the checked project root',t=>{
  const f=fixture(t);const linked=join(f.root,'linked');try{symlinkSync(f.source,linked,process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Platform denies creating test symlinks/junctions');return;}throw error;}assert.throws(()=>confined(f.root,'linked'),/Symlink|reparse/);assert.throws(()=>backupProject({...f.options,source:'linked'}),/Symlink|reparse/);assert.throws(()=>backupProject({...f.options,output:'linked/escape'}),/Symlink|reparse/);
});
test('contract wrapper plans all workspace tests and both WASMs without PowerShell or shell execution',()=>{
  const env={Path:'original-path',CARGO_HOME:'original-cargo'},copy={...env};const invocation=cargoInvocation(projectRoot,{platform:'win32',environment:env});assert.deepEqual(env,copy);if(invocation.local){assert.match(invocation.executable,/cargo\.exe$/);assert.match(invocation.env.CARGO_HOME,/\.tooling[\\/]cargo$/);assert.match(invocation.env.Path,/original-path$/);}else assert.equal(invocation.executable,'cargo');
  const tests=contractJobs(projectRoot,'test');assert.deepEqual(tests[0].args,['test','--workspace','--locked']);const builds=contractJobs(projectRoot,'build');assert.equal(builds.length,2);for(const job of builds){assert.ok(job.args.includes('--locked'));assert.ok(job.args.includes('--no-abi'));assert.ok(job.args.includes('--out-dir'));assert.match(job.artifact,/\.wasm$/);}assert.notEqual(builds[0].artifact,builds[1].artifact);
  const calls=[];assert.equal(runContracts('test',{runner:(executable,args,options)=>{calls.push({executable,args,options});return{status:0};}}),0);assert.equal(calls.length,1);assert.equal(calls[0].options.shell,false);assert.ok(!calls[0].executable.toLowerCase().includes('powershell'));assert.equal(runContracts('test',{runner:()=>({status:7})}),7);
});

