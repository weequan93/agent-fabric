/** Disposable fresh-process result/notification broker. No task execution or
 * model work; all reads and sends use current verified identity and audience. */
import pg from 'pg';
import {createIdentityScopeVerifier} from '../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../g1-identity/src/token-verifier.js';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {RecoveryRepository} from './repository.js';
import {ResultRepository} from './result-repository.js';
import {NotificationRepository} from './notification-repository.js';
const raw=process.env.FABRIC_RESULT_WORKER;if(!raw)throw new Error('Owned result broker configuration required');
const c=JSON.parse(raw) as {owner:string;dsn:string;issuer:string;jwksUrl:string;token:string;tenantId:string;spaceId:string;runId:string;action:'get'|'enqueue'|'send'|'reconcile'|'notification';recipientId?:string;notificationId?:string;endpoint?:string};
const pool=new pg.Pool({connectionString:c.dsn,max:2}),authority=new pg.Pool({connectionString:c.dsn,max:2});
const verifier=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{issuer:c.issuer,apiAudience:'recovery-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:s=>verifier.bindingFor(s)}),repo=new RecoveryRepository(uow,s=>verifier.bindingFor(s)),notifications=new NotificationRepository(repo);
process.stdout.write(JSON.stringify({kind:'ready',owner:c.owner,pid:process.pid,sessionCacheEntries:0})+'\n');
try{const scope=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token});let result:unknown;
 if(c.action==='get')result=await new ResultRepository(repo).get(scope,c.runId);
 else if(c.action==='enqueue'&&c.recipientId)result=await notifications.enqueue(scope,c.runId,c.recipientId);
 else if(c.action==='send'&&c.notificationId&&c.endpoint)result=await notifications.send(scope,c.notificationId,c.endpoint);
 else if(c.action==='reconcile'&&c.notificationId&&c.endpoint)result=await notifications.reconcile(scope,c.notificationId,c.endpoint);
 else if(c.action==='notification'&&c.notificationId)result=await notifications.get(scope,c.notificationId);
 else throw new Error('Exact result broker action required');
 process.stdout.write(JSON.stringify({kind:'result',owner:c.owner,pid:process.pid,result})+'\n');
}catch(error){process.stdout.write(JSON.stringify({kind:'denied',owner:c.owner,pid:process.pid,code:(error as {code?:string}).code??'ERROR'})+'\n');process.exitCode=1;}finally{await Promise.all([pool.end(),authority.end()]);process.stdout.write(JSON.stringify({kind:'cleanup',owner:c.owner,pid:process.pid,closed:true})+'\n');}
