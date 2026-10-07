import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import type {Pool} from 'pg';
// Supported additive history is pinned, including installed versions that the
// base migration must not reapply. A new increment must explicitly extend pins.
const recoveryPins: Readonly<Record<number,string>> = {
 4:'f8ef0b1e8dffba943843f72d6bc070a7ccf229c68e2363d214b8f4391e33cf13',
 5:'50a702ec1d750bf69926dab22c203b80e7fe669dc43791d8e88277a183e3c1e7',
 6:'a6528f72191a19576b88f4d40e9ef3c5d7ce7f8a55d23565c4015f3b0a2fc659',
 7:'f5c1135cad168f7c961bce725e5c2621bf814823ef4ba78aa9fbd26b7209d1a7',
 8:'2ec0c03a5a42b31678e29d0523fe98235bf3682a8f953aff97685e33072d0460',
 9:'d48656785b4ab27c0220648d479b325155339815423c5ed3222938515cfa9f88',
 10:'f0c6f09e637f2d120e036e958320fb8443329b0c580ac8e3b445210029388db0'
};
const prerequisites: Readonly<Record<number,number>> = {5:4,6:5,7:6,8:7,9:8,10:7};
export async function migrateRecovery(pool: Pool, options: {ownedSyntheticDatabase: true; sqlPath: string; injectBeforeCommit?: boolean}): Promise<void> {
 if (options.ownedSyntheticDatabase !== true) throw new Error('Owned synthetic database required');
 const sql = await readFile(resolve(options.sqlPath), 'utf8'), digest = createHash('sha256').update(sql).digest('hex');
 if (digest !== recoveryPins[4]) throw new Error('Recovery migration incompatible');
 const c = await pool.connect(); let locked = false;
 try {
  await c.query("SET statement_timeout='15s'; SET lock_timeout='2s'");
  await c.query("SELECT pg_advisory_lock(hashtextextended('agent-fabric-recovery-migration',0))"); locked = true;
  const foundation = (await c.query('SELECT version,digest FROM public.fabric_foundation_migrations ORDER BY version')).rows;
  const identity = (await c.query('SELECT version,digest FROM public.fabric_identity_migrations ORDER BY version')).rows;
  if (JSON.stringify(foundation.map(r => r.version)) !== '[1,2]' || JSON.stringify(identity.map(r => r.version)) !== '[3]') throw new Error('Unchanged F01/F02 ledgers required');
  const pinned = ['3976b9d7d6c877b17c91296cf19cf728cf1a378f284b58b554e546950e4bb027','2f40417a2b7f3544a64e7c57dcc7e84006a29e3f49458363f6ba553bd8361569','d7170eb1b5a4733421c6b4e1f05e92e7eba0663b341f7d48697e0e65fab759b7'];
  if (JSON.stringify([...foundation, ...identity].map(r => r.digest)) !== JSON.stringify(pinned)) throw new Error('F01/F02 migration digest incompatible');
  await c.query('BEGIN');
  try {
   await c.query('CREATE TABLE IF NOT EXISTS public.fabric_recovery_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());REVOKE ALL ON public.fabric_recovery_migrations FROM PUBLIC');
   const old = (await c.query('SELECT version,digest FROM public.fabric_recovery_migrations')).rows;
   const versions = new Set(old.map(r => Number(r.version))), base = old.find(r => Number(r.version) === 4);
   if ((old.length && !base) || old.some(r => r.digest !== recoveryPins[Number(r.version)] ||
       (Number(r.version) !== 4 && !versions.has(prerequisites[Number(r.version)]!)))) throw new Error('Recovery migration incompatible');
   if (!base) {
    await c.query(sql.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/, ''));
    if (options.injectBeforeCommit) throw new Error('Injected recovery migration rollback');
    await c.query('INSERT INTO public.fabric_recovery_migrations(version,digest) VALUES(4,$1)', [digest]);
   }
   await c.query('COMMIT');
  } catch (e) {await c.query('ROLLBACK'); throw e;}
 } finally {
  try {if (locked) await c.query("SELECT pg_advisory_unlock(hashtextextended('agent-fabric-recovery-migration',0))"); await c.query('RESET statement_timeout;RESET lock_timeout');} finally {c.release();}
 }
}
