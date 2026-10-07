// Synthetic local fixture only; private signing material stays in this owned child.
import pg from 'pg';
import {startTestIdp} from '../node_modules/.cache/recovery-build/g1-identity/src/test-idp.js';
const config = JSON.parse(process.env.FABRIC_RECOVERY_TEST_IDP ?? '{}'); delete process.env.FABRIC_RECOVERY_TEST_IDP;
const pool = new pg.Pool({connectionString: config.sessionDsn, max: 2}); delete config.sessionDsn;
config.sessionStore = {create: s => pool.query('SELECT fabric.identity_issue_session($1,$2,$3,$4)', [s.issuer,s.subject,s.sessionId,s.expiresAt]), revoke: s => pool.query('SELECT fabric.identity_revoke_session($1,$2,$3)', [s.issuer,s.subject,s.sessionId])};
const idp = await startTestIdp(config);
process.stdout.write(JSON.stringify({issuer: idp.issuer, jwksUrl: idp.jwksUrl, authorizationEndpoint: idp.authorizationEndpoint, tokenEndpoint: idp.tokenEndpoint}) + '\n');
let closing = false;
process.on('SIGTERM', async () => {if (closing) return; closing = true; await idp.close(); await pool.end(); process.exit(0);});
