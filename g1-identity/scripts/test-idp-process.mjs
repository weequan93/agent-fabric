// Separate synthetic IdP process. Private signing key is created only in this process.
import {startTestIdp} from '../node_modules/.cache/identity-build/g1-identity/src/test-idp.js';
const config=JSON.parse(process.env.FABRIC_TEST_IDP_CONFIG??'{}');delete process.env.FABRIC_TEST_IDP_CONFIG;
let pool;
if(config.sessionDsn){const {Pool}=await import('pg');pool=new Pool({connectionString:config.sessionDsn,max:2});delete config.sessionDsn;
 config.sessionStore={create:async s=>{await pool.query('SELECT fabric.identity_issue_session($1,$2,$3,$4)',[s.issuer,s.subject,s.sessionId,s.expiresAt]);},revoke:async s=>{await pool.query('SELECT fabric.identity_revoke_session($1,$2,$3)',[s.issuer,s.subject,s.sessionId]);}};
}
const service=await startTestIdp(config);
process.stdout.write(JSON.stringify({issuer:service.issuer,jwksUrl:service.jwksUrl,authorizationEndpoint:service.authorizationEndpoint,tokenEndpoint:service.tokenEndpoint,qualification:service.qualification})+'\n');
let closing=false;const close=async()=>{if(closing)return;closing=true;await service.close();await pool?.end();process.exit(0);};process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
