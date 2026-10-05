export class DeterministicClock {
 constructor(private time=1700000000000) {}
 now(): number { return this.time; }
 advance(milliseconds:number):void { if(!Number.isSafeInteger(milliseconds)||milliseconds<0)throw new Error('Invalid clock step');this.time+=milliseconds; }
}
export class DeterministicIds {
 private sequence=0;
 next(prefix:string):string { return prefix+'-'+(++this.sequence); }
}
export type CounterName = 'retrievalAttempts'|'dispatchAttempts'|'remoteWrites'|'modelCalls'|'vmProvisions'|'oldGenerationWrites'|'settlements'|'crossSpaceDisclosure'|'unauthorizedDispatch'|'duplicateEffect'|'replayModelCalls'|'replayWriteCalls'|'duplicateSettlements'|'unexpectedAllowedWorkRejections';
export class CallCounters {
 private readonly values:Partial<Record<CounterName,number>>={};
 increment(name:CounterName):void {this.values[name]=this.get(name)+1;}
 get(name:CounterName):number {return this.values[name]??0;}
 snapshot():Partial<Record<CounterName,number>> {return {...this.values};}
}
export function freshFixture(){ return {clock:new DeterministicClock(),ids:new DeterministicIds(),counters:new CallCounters()};}

