import { createLedgerFixture } from './ledger-fixture.js';
import { migrateModelUsage } from '../../src/usage-migration.js';
import { UsageRepository,type UsageHooks } from '../../src/usage-repository.js';
import { ModelService,type InstalledAdapter } from '../../src/model-service.js';
export async function createUsageFixture(options:Parameters<typeof createLedgerFixture>[0]={}){
 const l=await createLedgerFixture(options),f=l.f;
 try{
  if(!(await f.admin.query('SELECT 1 FROM public.fabric_model_migrations WHERE version=3')).rowCount){await migrateModelUsage(f.admin,{ownedSyntheticDatabase:true,owner:f.fixtureOwner,root:f.root,injectBeforeCommit:true}).then(()=>{throw new Error('Migration failed to roll back');},e=>{if(e.message!=='Injected usage migration rollback')throw e;});if((await f.admin.query("SELECT to_regclass('fabric.model_resolutions') AS table")).rows[0].table!==null)throw new Error('Partial usage migration');}
  await migrateModelUsage(f.admin,{ownedSyntheticDatabase:true,owner:f.fixtureOwner,root:f.root});
  const installed=():InstalledAdapter=>({ownerId:f.ownerId,route:f.profile.route,profileDigest:f.profile.profileDigest,port:f.adapterClient()});
  const usage=(hooks:UsageHooks={})=>new UsageRepository(f.uow,l.authority,hooks);
  const service=(hooks:UsageHooks={},adapters:readonly InstalledAdapter[]=[installed()],timeout=1000)=>new ModelService(l.model(hooks),usage(hooks),adapters,timeout);
  const snapshot=async()=>{const value=await l.snapshot();for(const table of ['model_receipt_owners','model_resolutions','model_usage_categories','model_deficits','model_deficit_allowances','model_deficit_accounts','model_deficit_covers'])value[table]=(await f.admin.query("SELECT coalesce(jsonb_agg(record ORDER BY record::text),'[]') AS rows FROM (SELECT to_jsonb(a) AS record FROM fabric."+table+" a) s")).rows[0].rows;return value;};
  return {...l,usage,service,installed,snapshot};
 }catch(e){await l.close();throw e;}
}
