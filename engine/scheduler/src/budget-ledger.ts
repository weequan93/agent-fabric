import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, sameScope, type ScopeRef } from '../../contracts/src/identity.js';
import { parseScope } from '../../contracts/src/task-envelope.js';
import type { AllowanceView, BudgetPort, Reservation, ReservationRequest, UsageSettlement } from '../../contracts/src/budget.js';

export interface AllowanceInput { allowanceId:string;scope:ScopeRef;payerId:string;ceilingUnits:number }
export interface AllowanceRecord extends AllowanceView {revision:number}
export interface CostAttribution {reservationId:string;category:'model'|'persistent-storage'|'shared-compute';resourceId:string;periodStart:number;periodEnd:number}
export interface CostSummary {estimated:Record<CostAttribution['category'],number>;settled:Record<CostAttribution['category'],number>}
export interface BudgetCheckpoint {schemaVersion:1;allowances:AllowanceRecord[];reservations:Reservation[];costs:CostAttribution[]}
export interface BudgetLedgerOptions {authorizeScope:(scope:ScopeRef)=>void;authorizeReservation:(request:ReservationRequest)=>void;authorizeAllowanceChange:(input:AllowanceInput,action:'create'|'top-up')=>void}
function parseReservation(value:unknown):ReservationRequest {
  canonicalDigest(value);const p=record(value,['reservationId','operationId','scope','actorId','payerId','runId','purpose','allowanceId','units']);
  requireCondition(p.purpose==='task'||p.purpose==='maintenance','INVALID_SCHEMA','Explicit accountable purpose required');
  return {reservationId:nonEmptyString(p.reservationId),operationId:nonEmptyString(p.operationId),scope:parseScope(p.scope),actorId:nonEmptyString(p.actorId),payerId:nonEmptyString(p.payerId),runId:nonEmptyString(p.runId),purpose:p.purpose,allowanceId:nonEmptyString(p.allowanceId),units:nonNegativeInteger(p.units)};
}
function requestOf(r:Reservation):ReservationRequest {return {reservationId:r.reservationId,operationId:r.operationId,scope:r.scope,actorId:r.actorId,payerId:r.payerId,runId:r.runId,purpose:r.purpose,allowanceId:r.allowanceId,units:r.units};}
/** Single synchronous G0 ledger owner; no provider billing or database durability claim. */
export class BudgetLedger implements BudgetPort {
  private readonly allowances=new Map<string,AllowanceRecord>();private readonly reservations=new Map<string,Reservation>();
  private readonly operations=new Map<string,string>();private readonly receipts=new Map<string,{reservationId:string;units:number}>();
  private readonly costs=new Map<string,CostAttribution>();
  constructor(private readonly options:BudgetLedgerOptions) {}
  createAllowance(value:AllowanceInput):AllowanceRecord {
    canonicalDigest(value);const p=record(value,['allowanceId','scope','payerId','ceilingUnits']);const scope=parseScope(p.scope);this.options.authorizeScope(scope);
    const allowanceId=nonEmptyString(p.allowanceId);const payerId=nonEmptyString(p.payerId);const ceilingUnits=nonNegativeInteger(p.ceilingUnits);
    this.options.authorizeAllowanceChange({allowanceId,scope:structuredClone(scope),payerId,ceilingUnits},'create');
    const existing=this.allowances.get(allowanceId);requireCondition(existing===undefined||(sameScope(existing.scope,scope)&&existing.payerId===payerId&&existing.ceilingUnits===ceilingUnits),'IDEMPOTENCY_CONFLICT','Allowance identity and payer are immutable');
    if(existing!==undefined)return structuredClone(existing);
    const allowance:AllowanceRecord={allowanceId,scope,payerId,ceilingUnits,reservedUnits:0,settledUnits:0,availableUnits:ceilingUnits,revision:0};this.allowances.set(allowanceId,allowance);return structuredClone(allowance);
  }
  reserve(value:ReservationRequest):Reservation {
    const request=parseReservation(value);this.options.authorizeScope(request.scope);this.options.authorizeReservation(structuredClone(request));const allowance=this.allowance(request.allowanceId);
    requireCondition(sameScope(allowance.scope,request.scope)&&allowance.payerId===request.payerId,'SCOPE_MISMATCH','Server-resolved payer and allowance scope required');
    const existing=this.reservations.get(request.reservationId);
    requireCondition(existing===undefined||canonicalDigest(requestOf(existing))===canonicalDigest(request),'IDEMPOTENCY_CONFLICT','Reservation identity is immutable');
    if(existing!==undefined)return structuredClone(existing);
    const operation=JSON.stringify([request.scope.tenantId,request.scope.spaceId,request.operationId]);
    requireCondition(!this.operations.has(operation),'IDEMPOTENCY_CONFLICT','One operation cannot copy its allowance into another reservation');
    requireCondition(allowance.availableUnits>=request.units,'BUDGET_EXHAUSTED','Preserve work and wait for an authorized top-up');
    const reservedUnits=nonNegativeInteger(allowance.reservedUnits+request.units);const result:Reservation={...request,state:'reserved',settledUnits:0,receiptId:null};
    const availableUnits=nonNegativeInteger(allowance.availableUnits-request.units),revision=nonNegativeInteger(allowance.revision+1);
    allowance.reservedUnits=reservedUnits;allowance.availableUnits=availableUnits;allowance.revision=revision;
    this.reservations.set(request.reservationId,structuredClone(result));this.operations.set(operation,request.reservationId);return structuredClone(result);
  }
  markUnknown(reservationId:string):Reservation {
    const reservation=this.current(reservationId);requireCondition(reservation.state==='reserved'||reservation.state==='unknown','IDEMPOTENCY_CONFLICT','Settled or released reservation cannot become unknown');reservation.state='unknown';return structuredClone(reservation);
  }
  settle(value:UsageSettlement):Reservation {
    canonicalDigest(value);const p=record(value,['reservationId','receiptId','units']);const reservation=this.current(nonEmptyString(p.reservationId));const receiptId=nonEmptyString(p.receiptId);const units=nonNegativeInteger(p.units);
    const receipt=this.receipts.get(receiptId);requireCondition(receipt===undefined||(receipt.reservationId===reservation.reservationId&&receipt.units===units),'IDEMPOTENCY_CONFLICT','Usage receipt identity is immutable');
    if(reservation.state==='settled'){requireCondition(reservation.receiptId===receiptId&&reservation.settledUnits===units,'IDEMPOTENCY_CONFLICT','Conflicting duplicate settlement');return structuredClone(reservation);}
    requireCondition(reservation.state==='reserved'||reservation.state==='unknown','IDEMPOTENCY_CONFLICT','Released reservations cannot settle');
    if(units>reservation.units){reservation.state='unknown';requireCondition(false,'BUDGET_EXHAUSTED','Usage exceeds reserved allowance; reconcile bounded overrun explicitly');}
    const allowance=this.allowance(reservation.allowanceId);const settled=nonNegativeInteger(allowance.settledUnits+units);const available=nonNegativeInteger(allowance.availableUnits+reservation.units-units);
    const reserved=nonNegativeInteger(allowance.reservedUnits-reservation.units),revision=nonNegativeInteger(allowance.revision+1);
    allowance.reservedUnits=reserved;allowance.settledUnits=settled;allowance.availableUnits=available;allowance.revision=revision;
    reservation.state='settled';reservation.settledUnits=units;reservation.receiptId=receiptId;this.receipts.set(receiptId,{reservationId:reservation.reservationId,units});return structuredClone(reservation);
  }
  release(reservationId:string):Reservation {
    const reservation=this.current(reservationId);if(reservation.state==='released')return structuredClone(reservation);
    requireCondition(reservation.state==='reserved','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Unknown or settled usage cannot be released');const allowance=this.allowance(reservation.allowanceId);
    const available=nonNegativeInteger(allowance.availableUnits+reservation.units),reserved=nonNegativeInteger(allowance.reservedUnits-reservation.units),revision=nonNegativeInteger(allowance.revision+1);allowance.reservedUnits=reserved;allowance.availableUnits=available;allowance.revision=revision;reservation.state='released';return structuredClone(reservation);
  }
  inspect(allowanceId:string):AllowanceView {const a=this.allowance(allowanceId);return structuredClone({allowanceId:a.allowanceId,scope:a.scope,payerId:a.payerId,ceilingUnits:a.ceilingUnits,reservedUnits:a.reservedUnits,settledUnits:a.settledUnits,availableUnits:a.availableUnits});}
  getReservation(reservationId:string):Reservation {return structuredClone(this.current(reservationId));}
  getAllowance(allowanceId:string):AllowanceRecord {return structuredClone(this.allowance(allowanceId));}
  topUp(allowanceId:string,units:number,expectedRevision?:number):AllowanceRecord {
    const allowance=this.allowance(allowanceId);nonNegativeInteger(units);if(expectedRevision!==undefined)requireCondition(allowance.revision===nonNegativeInteger(expectedRevision),'STALE_REVISION','Refresh allowance before top-up');
    const ceiling=nonNegativeInteger(allowance.ceilingUnits+units);const available=nonNegativeInteger(allowance.availableUnits+units);const revision=nonNegativeInteger(allowance.revision+1);
    this.options.authorizeAllowanceChange({allowanceId:allowance.allowanceId,scope:structuredClone(allowance.scope),payerId:allowance.payerId,ceilingUnits:ceiling},'top-up');
    allowance.ceilingUnits=ceiling;allowance.availableUnits=available;allowance.revision=revision;return structuredClone(allowance);
  }
  attributeCost(value:CostAttribution):CostAttribution {
    canonicalDigest(value);const p=record(value,['reservationId','category','resourceId','periodStart','periodEnd']);
    requireCondition(p.category==='model'||p.category==='persistent-storage'||p.category==='shared-compute','INVALID_SCHEMA','Explicit fee category required');
    const a:CostAttribution={reservationId:nonEmptyString(p.reservationId),category:p.category,resourceId:nonEmptyString(p.resourceId),periodStart:nonNegativeInteger(p.periodStart),periodEnd:nonNegativeInteger(p.periodEnd)};
    requireCondition(a.periodEnd>a.periodStart,'INVALID_SCHEMA','Fee interval must be bounded');const reservation=this.current(a.reservationId);const existing=this.costs.get(a.reservationId);
    requireCondition(existing===undefined||canonicalDigest(existing)===canonicalDigest(a),'IDEMPOTENCY_CONFLICT','Cost attribution is immutable');
    if(a.category==='shared-compute')for(const prior of this.costs.values())if(prior.reservationId!==a.reservationId&&prior.category==='shared-compute'&&prior.resourceId===a.resourceId)requireCondition(a.periodStart>=prior.periodEnd||prior.periodStart>=a.periodEnd,'IDEMPOTENCY_CONFLICT','A shared runtime interval cannot be charged in full to multiple task reservations');
    this.costs.set(reservation.reservationId,a);return structuredClone(a);
  }
  costSummary(allowanceId:string):CostSummary {
    this.allowance(allowanceId);const result:CostSummary={estimated:{model:0,'persistent-storage':0,'shared-compute':0},settled:{model:0,'persistent-storage':0,'shared-compute':0}};
    for(const a of this.costs.values()){const reservation=this.reservations.get(a.reservationId);if(reservation?.allowanceId===allowanceId){this.current(a.reservationId);result.estimated[a.category]=nonNegativeInteger(result.estimated[a.category]+reservation.units);result.settled[a.category]=nonNegativeInteger(result.settled[a.category]+reservation.settledUnits);}}
    return result;
  }
  checkpoint(scope:ScopeRef):BudgetCheckpoint {
    const parsed=parseScope(scope);this.options.authorizeScope(structuredClone(parsed));const allowances=[...this.allowances.values()].filter(a=>sameScope(a.scope,parsed)).map(a=>structuredClone(this.allowance(a.allowanceId)));
    const reservations=[...this.reservations.values()].filter(r=>sameScope(r.scope,parsed)).map(r=>structuredClone(this.current(r.reservationId)));const ids=new Set(reservations.map(r=>r.reservationId));return {schemaVersion:1,allowances,reservations,costs:[...this.costs.values()].filter(c=>ids.has(c.reservationId)).map(c=>structuredClone(c))};
  }
  /** Trusted latest owner checkpoint only, into a fresh instance. In-flight usage stays unknown. */
  restoreCheckpoint(value:BudgetCheckpoint):void {
    canonicalDigest(value);const p=record(value,['schemaVersion','allowances','reservations','costs']);requireCondition(p.schemaVersion===1&&Array.isArray(p.allowances)&&Array.isArray(p.reservations)&&Array.isArray(p.costs),'INVALID_SCHEMA','Versioned owner checkpoint required');
    requireCondition(this.allowances.size===0&&this.reservations.size===0,'IDEMPOTENCY_CONFLICT','A checkpoint cannot overwrite live accounting');const staged=new BudgetLedger(this.options);
    for(const raw of p.allowances){const a=record(raw,['allowanceId','scope','payerId','ceilingUnits','reservedUnits','settledUnits','availableUnits','revision']);const scope=parseScope(a.scope);const expected={allowanceId:nonEmptyString(a.allowanceId),scope,payerId:nonEmptyString(a.payerId),ceilingUnits:nonNegativeInteger(a.ceilingUnits),reservedUnits:nonNegativeInteger(a.reservedUnits),settledUnits:nonNegativeInteger(a.settledUnits),availableUnits:nonNegativeInteger(a.availableUnits),revision:nonNegativeInteger(a.revision)};requireCondition(nonNegativeInteger(expected.reservedUnits+expected.settledUnits+expected.availableUnits)===expected.ceilingUnits,'INVALID_SCHEMA','Checkpoint accounting conservation required');requireCondition(!staged.allowances.has(expected.allowanceId),'IDEMPOTENCY_CONFLICT','Duplicate allowance checkpoint');staged.createAllowance({allowanceId:expected.allowanceId,scope,payerId:expected.payerId,ceilingUnits:expected.ceilingUnits});}
    for(const raw of p.reservations){const r=record(raw,['reservationId','operationId','scope','actorId','payerId','runId','purpose','allowanceId','units','state','settledUnits','receiptId']);const request=parseReservation(Object.fromEntries(['reservationId','operationId','scope','actorId','payerId','runId','purpose','allowanceId','units'].map(k=>[k,r[k]])));requireCondition(!staged.reservations.has(request.reservationId),'IDEMPOTENCY_CONFLICT','Duplicate reservation checkpoint');const settled=nonNegativeInteger(r.settledUnits);requireCondition(['reserved','unknown','settled','released'].includes(r.state as string),'INVALID_SCHEMA','Checkpoint reservation state required');staged.reserve(request);
      if(r.state==='settled'){staged.settle({reservationId:request.reservationId,receiptId:nonEmptyString(r.receiptId),units:settled});}
      else {requireCondition(settled===0&&r.receiptId===null,'INVALID_SCHEMA','Non-settled checkpoint cannot invent a receipt');if(r.state==='released')staged.release(request.reservationId);else staged.markUnknown(request.reservationId);}
    }
    for(const raw of p.allowances){const a=raw as AllowanceRecord,computed=staged.allowance(a.allowanceId);requireCondition(computed.reservedUnits===a.reservedUnits&&computed.settledUnits===a.settledUnits&&computed.availableUnits===a.availableUnits,'INVALID_SCHEMA','Checkpoint totals must equal original reservations');computed.revision=a.revision;}
    for(const raw of p.costs)staged.attributeCost(raw as CostAttribution);
    for(const [id,a] of staged.allowances)this.allowances.set(id,structuredClone(a));for(const [id,r] of staged.reservations)this.reservations.set(id,structuredClone(r));for(const [id,op] of staged.operations)this.operations.set(id,op);for(const [id,r] of staged.receipts)this.receipts.set(id,structuredClone(r));for(const [id,c] of staged.costs)this.costs.set(id,structuredClone(c));
  }
  private allowance(id:string):AllowanceRecord {const a=this.allowances.get(nonEmptyString(id));requireCondition(a!==undefined,'UNAUTHORIZED','Current allowance authority required');this.options.authorizeScope(structuredClone(a.scope));return a;}
  private current(id:string):Reservation {const r=this.reservations.get(nonEmptyString(id));requireCondition(r!==undefined,'UNAUTHORIZED','Current reservation authority required');this.options.authorizeScope(structuredClone(r.scope));this.options.authorizeReservation(structuredClone(requestOf(r)));return r;}
}
