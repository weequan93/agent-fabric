import { object,uuid,nullable,body } from './decoder.js';
import { TurnCommandSchema,RetryTurnCommandSchema,ResumeCommandSchema,SwitchCommandSchema,TopUpSchema,StopSchema } from './native-repository.js';
import { ProfileChoiceSchema } from './profile.js';
import { ResourceCommandSchema } from './resource-contract.js';
import { demand } from './errors.js';
/** Bounded trusted-parent IPC entry point. The installed service authenticates
 * each command; input cannot supply identity, payer, receipts, URLs or SQL. */
export type OperatorPort=(kind:string,input:unknown)=>Promise<Record<string,unknown>>;
const session=object({sessionId:uuid});
export async function operatorCommand(port:OperatorPort,command:string,input:unknown):Promise<Record<string,unknown>>{
 let parsed:unknown;
 switch(command){
  case 'qualify':parsed=object({}).parse(input);break;
  case 'operatorInspect':case 'inspect':case 'replay':parsed=session.parse(input);break;
  case 'operatorPreflight':parsed=object({sessionId:uuid,input:body,choice:nullable(ProfileChoiceSchema)}).parse(input);break;
  case 'requestTurn':parsed=TurnCommandSchema.parse(input);break;
  case 'retryTurn':parsed=RetryTurnCommandSchema.parse(input);break;
  case 'dispatchPrepared':case 'reconcile':parsed=object({sessionId:uuid,operationId:uuid}).parse(input);break;
  case 'resume':parsed=ResumeCommandSchema.parse(input);break;
  case 'switchProfile':parsed=SwitchCommandSchema.parse(input);break;
  case 'topUp':parsed=TopUpSchema.parse(input);break;
  case 'stop':parsed=StopSchema.parse(input);break;
  case 'resourceInspect':parsed=object({resourceId:uuid,sessionId:nullable(uuid)}).parse(input);break;
  case 'resourceLifecycle':parsed=ResourceCommandSchema.parse(input);break;
  case 'resourceRecord':parsed=object({receiptId:uuid}).parse(input);break;
  case 'resourceConfirmSuspended':parsed=object({proofId:uuid}).parse(input);break;
  default:demand(false,'REQUIRED_CAPABILITY_UNSUPPORTED');
 }
 return port(command,parsed);
}
