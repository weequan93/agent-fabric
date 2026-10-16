/** Service-owned synthetic persistence adapter, never production owner SQL. */
import {DatabaseSync} from 'node:sqlite';
import {ResourceStoreError,type ResourceStore,type ResourceTransaction,type ResourceTicket} from '../../src/resource-repository.js';
export interface SQLiteFaults {readonly readOnly?:boolean;readonly beforeCommit?:()=>Promise<void>;readonly afterCommit?:()=>Promise<void>}
export class SQLiteResourceStore implements ResourceStore {
 private readonly db:DatabaseSync;
 constructor(path:string,private readonly faults:SQLiteFaults={}){
  this.db=new DatabaseSync(path,{readOnly:faults.readOnly??false});
  this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1500');
  if(!faults.readOnly&&!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'").get())this.db.exec(`PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS tickets(ticket_id TEXT PRIMARY KEY,sequence INTEGER UNIQUE NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS owners(tenant TEXT NOT NULL,space TEXT NOT NULL,resource TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('read','write')),ticket TEXT NOT NULL REFERENCES tickets(ticket_id),PRIMARY KEY(tenant,space,resource,ticket));`);
 }
 close():void{this.db.close();}
 observe():{tickets:ResourceTicket[];owners:Record<string,unknown>[];journalMode:unknown;foreignKeys:unknown[]}{
  return {tickets:this.db.prepare('SELECT payload FROM tickets ORDER BY sequence').all().map(r=>JSON.parse(String(r['payload'])) as ResourceTicket),owners:this.db.prepare('SELECT * FROM owners ORDER BY ticket,resource').all(),journalMode:this.db.prepare('PRAGMA journal_mode').get(),foreignKeys:this.db.prepare('PRAGMA foreign_key_check').all()};
 }
 async transaction<T>(body:(tx:ResourceTransaction)=>Promise<T>,beforeCommit:()=>Promise<void>):Promise<T>{
  let begun=false,committed=false;
  try{
   this.db.exec('BEGIN IMMEDIATE');begun=true;
   const tx:ResourceTransaction={
    tickets:()=>this.observe().tickets,
    save:t=>{this.db.prepare('INSERT INTO tickets(ticket_id,sequence,payload) VALUES(?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET payload=excluded.payload').run(t.ticketId,t.sequence,JSON.stringify(t));},
    claim:t=>{
     for(const r of t.request.resources){
      const rows=this.db.prepare('SELECT mode FROM owners WHERE tenant=? AND space=? AND resource=?').all(t.request.binding.tenantId,t.request.binding.spaceId,r.resourceId);
      if(rows.some(o=>r.mode==='write'||o['mode']==='write'))throw new Error('Atomic ownership invariant');
     }
     for(const r of t.request.resources)this.db.prepare('INSERT INTO owners(tenant,space,resource,mode,ticket) VALUES(?,?,?,?,?)').run(t.request.binding.tenantId,t.request.binding.spaceId,r.resourceId,r.mode,t.ticketId);
    },
    release:t=>{
     const count=this.db.prepare('SELECT COUNT(*) AS n FROM owners WHERE ticket=?').get(t.ticketId)!['n'];
     if(count!==t.request.resources.length)throw new Error('Incomplete owner set cannot release');
     this.db.prepare('DELETE FROM owners WHERE ticket=?').run(t.ticketId);
    }
   };
   const result=await body(tx);await this.faults.beforeCommit?.();await beforeCommit();this.db.exec('COMMIT');committed=true;await this.faults.afterCommit?.();return result;
  }catch(e){
   if(begun&&!committed){try{this.db.exec('ROLLBACK');}catch{/* original failure wins */}}
   if(committed)throw new ResourceStoreError('unknown','Commit acknowledged locally but response lost');
   if(e instanceof Error&&'code' in e&&String(e.code).startsWith('ERR_SQLITE'))throw new ResourceStoreError('not-committed',e.message);
   throw e;
  }
 }
}
