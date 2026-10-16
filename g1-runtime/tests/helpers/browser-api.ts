import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {browserHttp,BrowserBoundary} from '../../src/browser.js';
import type {SessionAuthority} from '../../../g1-identity/src/contracts.js';
const root=process.argv[2]!;
const config=()=>JSON.parse(readFileSync(join(root,'authority.json'),'utf8')) as {issuer:string;now:number;revoked:boolean;authority:SessionAuthority};
const identity=createIdentityScopeVerifier({now:()=>config().now/1000,
 verifyToken:token=>{const c=config();return verifyAccessToken(token,{issuer:c.issuer,jwksUrl:c.issuer+'/jwks',apiAudience:'browser-refusal',now:()=>config().now/1000});},
 lookupAuthority:async(session,scope)=>{const c=config();return !c.revoked&&session.issuer===c.issuer&&session.subject==='synthetic-browser-member'&&session.sessionId==='synthetic-browser-session'&&scope.tenantId===c.authority.tenantId&&scope.spaceId===c.authority.spaceId?c.authority:null;}
});
const server=browserHttp(new BrowserBoundary({authenticate:request=>identity.verify(request)}));
server.listen(0,'127.0.0.1',()=>process.send?.({pid:process.pid,port:(server.address() as {port:number}).port}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
