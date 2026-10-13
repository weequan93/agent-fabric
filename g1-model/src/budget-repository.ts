import { uuid } from './decoder.js';
import { CostCategorySchema,OriginalCallSchema } from './schema.js';
import { positiveUnits, safeAdd, units } from './arithmetic.js';
import { demand, ModelError } from './errors.js';
import type { CostCategory, OriginalCall, SqlTransaction } from './contracts.js';
export type ReservationCategories=Readonly<Partial<Record<CostCategory,number>>>;
export function decodeCategories(value:unknown):ReservationCategories{
 demand(value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype);
 const result:Partial<Record<CostCategory,number>>={};
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);demand(typeof key==='string'&&d&&Object.hasOwn(d,'value'));result[CostCategorySchema.parse(key)]=units(d.value);}
 positiveUnits(safeAdd(...Object.values(result)));return Object.freeze(result);
}
/** Borrow the authenticated transaction. Never commit outside native intent. */
export class TransactionBudgetRepository{
 constructor(readonly tx:SqlTransaction){}
 async reserve(runId:string,original:OriginalCall,categories:ReservationCategories):Promise<string>{
  const parsed=decodeCategories(categories),o=OriginalCallSchema.parse(original);uuid.parse(runId);
  const scope=(await this.tx.query('SELECT fabric.current_tenant() AS tenant,fabric.current_space() AS space')).rows[0];
  demand(scope?.['tenant']===o.tenantId&&scope['space']===o.spaceId,'SCOPE_MISMATCH');
  // A refused/unfinished family upgrade cannot run new code against model2's
  // old child-only reserve. Missing schema or trusted membership fails closed.
  demand((await this.tx.query('SELECT 1 FROM fabric.model_budget_lineage WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[o.tenantId,o.spaceId,runId])).rowCount===1,'CHECK_BINDING_MISMATCH');
  try{return String((await this.tx.query('SELECT fabric.model_reserve($1,$2,$3,$4::jsonb) AS allowance',[runId,o.reservationId,o.attemptId,JSON.stringify(parsed)])).rows[0]?.['allowance']);}
  catch(e){if((e as {code?:string}).code==='P0003')throw new ModelError('OVERRUN_LIABILITY');if((e as {code?:string}).code==='P0002')throw new ModelError('BUDGET_EXHAUSTED');throw e;}
 }
}
