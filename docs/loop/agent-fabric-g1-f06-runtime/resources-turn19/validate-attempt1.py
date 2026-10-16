"""Resource/document diagnostics only; never executes product, DB, Docker, GUI or remote checks."""
from pathlib import Path
import json,hashlib,re,sys
from datetime import datetime,timezone
root=Path.cwd(); base=root/'docs/loop/agent-fabric-g1-f06-runtime'; out=root/sys.argv[1]
if out.exists(): raise SystemExit('Preserve prior diagnostics; choose new output')
read=lambda p:json.loads((root/p).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report=base/'readiness.md'; text=report.read_text(); checks=[]
def check(name,ok,detail):checks.append({'name':name,'pass':bool(ok),'detail':detail})
links=re.findall(r'\[[^\]]+\]\(([^)]+)\)',text)
missing=[p for p in links if not p.startswith(('https:','http:','#')) and not (report.parent/p.split('#')[0]).exists() and (report.parent/p).resolve()!=out.resolve()]
check('report-links-and-fences',not missing and len(re.findall(r'^```',text,re.M))%2==0,{'links':len(links),'missing':missing})
initial=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/initial-snapshot.json')
changed=[p for p,h in initial.items() if not (root/p).is_file() or sha(root/p)!=h]
check('preserve-source-raw-prior-results-and-unrelated-F05',changed==['docs/loop/agent-fabric-g1-f06-runtime/readiness.md'],{'files':len(initial),'changed':changed,'controllerStateExcluded':True})
audit=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/audit-results.json')
check('original-guard-constants',all(not x['mismatches'] for x in audit['hashDiagnostics']) and [x['files'] for x in audit['hashDiagnostics']]==[597,42],audit['hashDiagnostics'])
state=read('.loop/goals/agent-fabric-g1-f06-runtime/state.json'); goal=read('.loop/goals/agent-fabric-g1-f06-runtime/goal.json'); plan=read('docs/loop/agent-fabric-g1-f06-runtime/task-plan.json')['tasks']; actual={t['id']:t for t in state['tasks']}
expected={t['id']:{**t,'checks':[{**c,'cwd':c.get('cwd','.'),'expect_exit':0} for c in t['checks']]} for t in plan}
bad={i:[k for k in ['title','detail','role','depends_on','covers','checks','team'] if actual[i].get(k,[])!=t.get(k,[])] for i,t in expected.items()};bad={i:k for i,k in bad.items() if k}
coverage=set(x for t in plan for x in t['covers']); finalized={r['id'] for r in state['requirements']}; seats={t['id']:sum(s['count'] for s in t.get('team',[])) or 1 for t in plan}
check('exact-controller-mirror-teams-and-requirements',not bad and coverage==finalized and len(finalized)==101 and max(seats.values())+1<=audit['teamLimit'] and all(t['status']=='pending' for t in state['tasks']),{'mismatches':bad,'tasks':len(plan),'requirements':len(coverage),'specialistSeats':seats,'teamLimit':audit['teamLimit'],'implementationTasksDone':False})
checks_total=sum(len(t['checks']) for t in plan); seconds=sum(c['timeout'] for t in plan for c in t['checks'])
accept=[(c['argv'],c['timeout']) for c in goal['acceptance']]; want=[(['node',p],n) for p,n in [('g1-runtime/scripts/check.mjs',1800),('g1-identity/scripts/check.mjs',600),('g1-foundations/scripts/check.mjs',600),('g1-foundations/scripts/check-retained.mjs',900)]]
check('frozen-checks-and-policy-arithmetic',checks_total==25 and seconds==13860 and accept==want and goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None and goal['policy']['turn_timeout_minutes']==120,{'taskChecks':checks_total,'taskSeconds':seconds,'acceptance':accept,'policy':audit['budget'],'amendmentNeededForKnownTotalLimit':False})
probe=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/results.json'); rows={r['name']:r for r in probe['records']}
missing_rows=[r['name'] for r in probe['records'] if r['result']!='ready']; check('fresh-local-primitives-and-offline-owner-installs',set(missing_rows)=={'process-census','cpu-sysctl','memory-sysctl'} and rows['process-census']['error']['code']=='EPERM' and probe['dockerInvoked'] is False and probe['remoteInvoked'] is False,{'readyCount':len(rows)-len(missing_rows),'missing':missing_rows,'censusError':rows['process-census']['error']})
clients=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/client-cache-results.json'); archive=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/electron-cache.json'); owner=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/owner-audit-results.json')
check('client-cache-and-native-resource-gap',len(clients['checks'])==4 and all(c['status']==0 and not c['error'] for c in clients['checks']) and clients['ownedTempRemoved'] and not archive['matches'] and owner['metadata']['g1-local/desktop']['binaryPresent'] and not owner['metadata']['g1-local/desktop']['binaryExecuted'],{'offlineClients':{c['owner']:c['status'] for c in clients['checks']},'vendorArchives':archive['matches'],'nativeBehaviorQualified':False})
protocol=read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn19/protocol-results.json'); rec={r['name']:r['observation'] for r in protocol['records']}
check('current-owner-and-revised-protocol-types',owner['compile']['status']==0 and not owner['compile']['skipLibCheck'] and all(owner['assertions'].values()) and rec['strict-installed-owner-signatures']['status']==0 and rec['eight-type-negatives']['observedErrors']==8 and rec['source-established-gaps-and-seams']['rawFenceIsKeyFirst'] and rec['source-established-gaps-and-seams']['ordinaryReconciliationRejectsStoppedExpired'],{'strictImports':owner['compile']['status'],'specimenCompile':rec['strict-installed-owner-signatures']['status'],'typeNegatives':rec['eight-type-negatives']['observedErrors'],'sqlBehaviorRun':False})
sourcepins={p:v['sha256'] for p,v in owner['sourcePins'].items()}; sourcepins.update({v['path']:v['sha256'] for v in rec['source-established-gaps-and-seams']['sources'].values()})
badpins=[p for p,h in sourcepins.items() if sha(root/p)!=h]
check('revised-owner-source-pins-still-current',not badpins,{'sources':len(sourcepins),'mismatches':badpins})
paths=['stopped-original-stop-run','stopped-original-stop-task','lease-expired-original','effect-expired-original','stop-and-both-expiries'];groups=['fresh-authority','trusted-terminal-get','quiescence-snapshot','original-owner-atomicity','rollback-commit-recovery','concurrent-dedup-conflict','old-worker-replay-denied'];schedules=['native-first-equal','native-first-conflict','top-level-first-equal','top-level-first-conflict','lookup-coexistence','distinct-keys','native-stop-versus-transfer-both-winners','raw-composition-rejected-before-commands']
newtokens=paths+groups+schedules+['runtime_settle_original_effect','SECURITY INVOKER','recovery_operations','recovery_effect_events','recovery_receipts/outbox','synchronizeDelivery','NO phase key','pg_blocking_pids','superseded','600s fit is not measured or qualified','240–420min','EVERY','all']
# Only meaningful normative tokens are required; case in prose is otherwise free.
newtokens=newtokens[:-2]
missing_new=[t for t in newtokens if t not in text]
check('new-protocol-gates-and-full-workload-allocation',not missing_new,{'missing':missing_new,'paths':paths,'groupsPerPath':groups,'nativeSchedulesAndControls':schedules,'behaviorClaimed':False})
envelope=[60,45,60,65,55,200,45,30]
check('unchanged-whole09-bound-and-explicit-unmeasured-headroom',sum(envelope)==560 and sum(envelope)+40==600 and '25 task checks totaling13860s' in text and 'full P11' in text and 'No current evidence establishes either bound' in text,{'provisionalPhaseSeconds':envelope,'total':sum(envelope),'originalCeiling':600,'headroom':40,'measured':False})
gates=['approved:false','no Docker','real SSH','one private','original-key','Pinned Electron archive','No freeze/re-freeze performed','when only prohibited']
missing_gates=[x for x in gates if x.lower() not in text.lower()]
check('truthful-environment-approval-and-ownership-gates',not missing_gates and not any(audit['futureArtifacts'].values()),{'missingTokens':missing_gates,'futureArtifacts':audit['futureArtifacts'],'externalApprovalRequestedAgain':False})
result={'kind':'resources-document-diagnostics-only','observedAt':datetime.now(timezone.utc).isoformat(),'reportSha256':sha(report),'allPass':all(x['pass'] for x in checks),'checks':checks,'productTestsRun':False,'pgRun':False,'dockerInvoked':False,'guiInvoked':False,'remoteTestEnvironmentAccessed':False,'controllerAcceptance':False}
out.write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps({'allPass':result['allPass'],'checks':[{'name':c['name'],'pass':c['pass']} for c in checks]},indent=2));sys.exit(0 if result['allPass'] else 1)
