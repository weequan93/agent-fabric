import type { AsyncUnitOfWork,SqlTransaction } from '../../src/contracts.js';
import { NativeRepository,type NativeSnapshot } from '../../src/native-repository.js';
import type { WaitRecord } from '../../src/contracts.js';
import { WaitSchema } from '../../src/schema.js';
/** Installed deterministic CONTROL clock. It changes only F04's two time
 * statements to parameterized PG time predicates; all SQL, authority, locks,
 * writes and commits still run through the authenticated native UoW. It does
 * not alter identity expiry, model accounting or production clock behavior. */
export function waitClock(repository:NativeRepository){
 let now=Date.parse('2040-01-01T00:00:00.000Z');
 const initial=now,expiry=initial+100;
 const uow:AsyncUnitOfWork={withScope:(scope,work)=>repository.uow.withScope(scope,tx=>{
  const clockTx:SqlTransaction={query:async(sql,args)=>{
   if(sql==='SELECT clock_timestamp() AS at')return tx.query('SELECT $1::timestamptz AS at',[new Date(now).toISOString()]);
   if(sql==='SELECT $1::timestamptz>clock_timestamp() AS live')return tx.query('SELECT $1::timestamptz>$2::timestamptz AS live',[args?.[0],new Date(now).toISOString()]);
   return tx.query(sql,args);
  }};return work(clockTx);
 })};
 class PolicyRepository extends NativeRepository{
  override async makeWait(tx:SqlTransaction,s:NativeSnapshot,reason:WaitRecord['reason'],_expiresAt:string|null){
   return WaitSchema.parse({...await super.makeWait(tx,s,reason,new Date(expiry).toISOString()),expiresAt:new Date(expiry).toISOString()});
  }
 }
 return {repository:new PolicyRepository(uow,repository.bindingFor),initial,expiry,now:()=>now,advance:(at:number)=>{if(at<now)throw new Error('Fixture clock must be monotone');now=at;console.log(JSON.stringify({measurement:'native-wait-control-clock',at,expiry,assurance:'deterministic-local-only'}));},commandExpiry:()=>new Date(initial+10_000).toISOString()};
}
