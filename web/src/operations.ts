export interface PendingOperation {id:string;actor:string;path:string;body:unknown;createdAt:number;fingerprint:string;}
export interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void;}
const key='alltogether.local.operations.v1';
export function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(value);}
export class OperationJournal {
  private memory:PendingOperation[]=[];
  private storage?:StorageLike;
  constructor(storage?:StorageLike){this.storage=storage;}
  list(actor?:string):PendingOperation[]{let items=this.memory;if(this.storage){const raw=this.storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||parsed.length>128||!parsed.every(x=>x&&typeof x.id==='string'&&typeof x.actor==='string'&&typeof x.path==='string'&&x.path.startsWith('/')&&!x.path.startsWith('//')&&!x.path.includes('://')&&typeof x.fingerprint==='string'))throw new Error('The saved operation journal is invalid. Preserve it and inspect the ledger before retrying.');items=parsed;}}return items.filter(x=>!actor||x.actor===actor);}
  begin(actor:string,path:string,body:unknown,id:string):PendingOperation {const fingerprint=canonical(['local',actor,path,body]),items=this.list(),old=items.find(x=>x.fingerprint===fingerprint);if(old)return old;if(items.length>=128)throw new Error('Resolve the earlier uncertain operations before starting more.');const entry={id,actor,path,body,createdAt:Date.now(),fingerprint};this.save([...items,entry]);return entry;}
  resolve(id:string,actor:string){this.save(this.list().filter(x=>x.id!==id||x.actor!==actor));}
  private save(items:PendingOperation[]){if(this.storage)this.storage.setItem(key,JSON.stringify(items));this.memory=items;}
}
let fallback:OperationJournal|undefined;
export function journal():OperationJournal {if(typeof window==='undefined')return fallback??=new OperationJournal();return new OperationJournal(window.localStorage);}
export function announceOperations(){if(typeof window!=='undefined')window.dispatchEvent(new Event('alltogether:operations'));}
export class RefreshSequence {
  private generation=0;private active=0;
  invalidate(){this.generation++;}
  async run<T>(load:()=>Promise<T>,apply:(value:T)=>void,failed:(error:unknown)=>void,force=false):Promise<void>{if(this.active&&!force)return;const generation=++this.generation;this.active++;try{const value=await load();if(generation===this.generation)apply(value);}catch(error){if(generation!==this.generation)return;failed(error);throw error;}finally{this.active--;}}
}
export function mergeById<T extends{id:string}>(prior:T[],incoming:T[]):T[]{const map=new Map(prior.map(x=>[x.id,x]));for(const item of incoming)map.set(item.id,item);return [...map.values()];}
