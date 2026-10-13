import pg from 'pg';
import { object, text, uuid } from './decoder.js';
import { OperatingProfileSchema, OriginalCallSchema } from './schema.js';
import { demand, safeFailure } from './errors.js';
import { DeterministicReceiptOwner, startAdapterServer, DEFAULT_SCHEDULE, HOOKS, ScheduleSchema, type Hook, type Schedule } from './test-adapter.js';

const ConfigSchema=object({dsn:text,ownerId:uuid,token:uuid,marker:uuid,profile:OperatingProfileSchema});
const config=ConfigSchema.parse(JSON.parse(process.env['FABRIC_MODEL_ADAPTER']??'null'));
delete process.env['FABRIC_MODEL_ADAPTER'];
for(const key of Object.keys(process.env))if(!['PATH','LC_ALL'].includes(key))delete process.env[key];
demand(process.argv[2]===config.marker);
const dsn=new URL(config.dsn);
demand(dsn.protocol==='postgresql:' && dsn.hostname==='127.0.0.1' && dsn.pathname==='/model_test' && /^m_[a-f0-9]+_receipt$/.test(dsn.username));
const pool=new pg.Pool({connectionString:config.dsn,max:8,connectionTimeoutMillis:2000});
const role=(await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'fabric','USAGE') AS controller_access FROM pg_roles WHERE rolname=current_user")).rows[0];
demand(role && !role.rolsuper && !role.rolbypassrls && !role.rolcreatedb && !role.rolcreaterole && !role.controller_access,'UNAUTHORIZED');
demand((await pool.query('SELECT owner_id FROM model_receipts.access WHERE login_name=current_user')).rows[0]?.owner_id===config.ownerId,'UNAUTHORIZED');
type Gate={release:()=>void;promise:Promise<void>;hits:number};
const gates=new Map<Hook,Gate>(), schedules=new Map<string,Schedule>(),lost=new Set<string>();
const attemptKey=(o:{attemptId:string})=>o.attemptId;
const hooks={
 async hit(hook:Hook,original:ReturnType<typeof OriginalCallSchema.parse>){
  const gate=gates.get(hook);if(!gate)return;gate.hits++;
  process.send?.({kind:'barrier-hit',hook,original,hits:gate.hits});
  // Hooks are test controls only. Fail boundedly; never manufacture owner evidence.
  let timer:NodeJS.Timeout|undefined;
  try{await Promise.race([gate.promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Fixture barrier deadline')),15_000);})]);}finally{clearTimeout(timer);}
 },
 schedule:(o:{attemptId:string})=>schedules.get(attemptKey(o))??DEFAULT_SCHEDULE,
 loseAck:(o:{attemptId:string})=>lost.has(attemptKey(o))
};
const owner=new DeterministicReceiptOwner(pool,config.ownerId,config.profile,hooks);
process.on('message',async value=>{
 let requestId:unknown;
 try{
  demand(value && typeof value==='object');const v=value as Record<string,unknown>;requestId=uuid.parse(v['requestId']);
  const kind=v['kind'];demand(['arm','release','schedule','finalize'].includes(String(kind)));
  if(kind==='arm'||kind==='release'){
   demand(Object.keys(v).sort().join(',')==='hook,kind,requestId');demand(HOOKS.includes(v['hook'] as Hook));const hook=v['hook'] as Hook;
   if(kind==='arm'){demand(!gates.has(hook));let release!:()=>void;const promise=new Promise<void>(r=>release=r);gates.set(hook,{release,promise,hits:0});}
   else {const gate=gates.get(hook);demand(gate && gate.hits>0);gates.delete(hook);gate.release();}
  }else if(kind==='schedule'){
   demand(Object.keys(v).sort().join(',')==='dropAck,kind,original,requestId,schedule');const original=OriginalCallSchema.parse(v['original']);
   demand(typeof v['dropAck']==='boolean');schedules.set(attemptKey(original),ScheduleSchema.parse(v['schedule']));if(v['dropAck'])lost.add(attemptKey(original));else lost.delete(attemptKey(original));
  }else {demand(Object.keys(v).sort().join(',')==='kind,original,requestId');await owner.finalize(OriginalCallSchema.parse(v['original']));}
  process.send?.({kind:'control-ack',requestId});
 }catch(error){process.send?.({kind:'control-error',requestId,failure:safeFailure(error)});}
});
await owner.recover();
const server=await startAdapterServer(owner,config.token,hooks.loseAck);
process.stdout.write(JSON.stringify({schemaVersion:1,url:server.url,ownerId:config.ownerId,marker:config.marker,pid:process.pid,role:role.role,environmentKeys:Object.keys(process.env).sort(),adapterVersion:'deterministic-adapter-v1',assurance:'deterministic-local-only'})+'\n');
let closing=false;
process.on('SIGTERM',async()=>{
 if(closing)return;closing=true;for(const gate of gates.values())gate.release();gates.clear();
 await server.close();await pool.end();process.exit(0);
});
