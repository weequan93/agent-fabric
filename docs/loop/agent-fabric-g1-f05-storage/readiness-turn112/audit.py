"""Read-only readiness validation; bootstrap writes only the new audit result."""
import json,re,hashlib,sys,csv,io
from pathlib import Path
from capture import ROOT,BASE,PREFIX,read,write,binding
REPORT=str(BASE.parent.relative_to(ROOT))+'/readiness.md'
bootstrap=sys.argv[1:]==['--bootstrap'];assert sys.argv[1:] in [[],['--bootstrap']]
def verify(b,alternate=None):
 p=ROOT/(alternate or b['path']);assert p.is_file() and not p.is_symlink(),p;raw=p.read_bytes()
 assert len(raw)==b['bytes'] and hashlib.sha256(raw).hexdigest()==b['sha256'].removeprefix('sha256:'),p
def deepbindings(value):
 if isinstance(value,dict):
  if all(k in value for k in ['path','bytes','sha256']):verify(value)
  for v in value.values():deepbindings(v)
 elif isinstance(value,list):
  for v in value:deepbindings(v)
def lines(n):return [json.loads(l) for l in (BASE/n).read_text().splitlines()]
live=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json');before=read(PREFIX+'/controller-before.json');observed=read(PREFIX+'/controller-observed.json')
assert before['tasks']==observed['tasks']==live['tasks'] and before['requirements']==observed['requirements']==live['requirements'] and live['requirements_final']
assert goal==read(PREFIX+'/goal-before.json')==read(PREFIX+'/goal-observed.json')
keys=['id','title','detail','covers','depends_on','role','team','checks'];plan=read(PREFIX+'/current-plan.json')
assert plan['tasks']==[{k:t[k] for k in keys} for t in live['tasks']] and plan['requirements']==live['requirements']
assert (len(live['tasks']),sum(len(t['checks']) for t in live['tasks']),len(live['requirements']))==(65,109,96)
counts={s:sum(t['status']==s for t in live['tasks']) for s in ['done','pending','active']};assert counts=={'done':43,'pending':20,'active':2}
old=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/plan-before.json');oldtasks={t['id']:t for t in old['tasks']};tasks={t['id']:t for t in live['tasks']}
assert len(oldtasks)==64 and sum(len(t['checks']) for t in oldtasks.values())==105
for id,t in oldtasks.items():
 assert t['checks']==tasks[id]['checks']
 if t['status']=='done':assert t==tasks[id]
 for k in keys:
  if k=='depends_on' and id=='f05-11-full-predecessors':assert tasks[id][k]==t[k]+['f05-11-full-receipt-transport']
  else:assert t[k]==tasks[id][k]
assert old['requirements']==live['requirements']
amended={t['id']:t for t in read('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/plan-after.json')['tasks']}
for id,t in tasks.items():
 for k,v in amended[id].items():
  if k=='notes':assert t[k][:len(v)]==v # Controller subsequently appended the plan-review finding to the active task.
  else:assert t[k]==v
visited=set();visiting=set()
def visit(id):
 assert id in tasks and id not in visiting
 if id in visited:return
 visiting.add(id)
 for dep in tasks[id]['depends_on']:visit(dep)
 visiting.remove(id);visited.add(id)
for id in tasks:visit(id)
covered={r for t in tasks.values() for r in t['covers']};assert not ({r['id'] for r in live['requirements']}-covered)
matrix={m[1]:m[3] for line in (BASE.parent/'test-plan.md').read_text().splitlines() if (m:=re.match(r'^\| (AF-07|UX-01|R-\d{3}) \| (must|should|could) \| (.*?) \|',line))}
assert len(matrix)==96
for r in live['requirements']:assert matrix[r['id']]==r['text'],r['id']
preserved=read(PREFIX+'/preservation-before.json')['files']
for b in preserved:verify(b,PREFIX+'/readiness-turn106-preserved.md' if b['path']==REPORT else None)
oldseal=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn106/submission-binding.json');verify(oldseal['readiness'],PREFIX+'/readiness-turn106-preserved.md')
for b in oldseal['files']:verify(b)
for item in read(PREFIX+'/reuse-bindings.json'):
 verify(item['source'])
 for b in item['sealedArtifacts']:verify(b)
protected=read('g1-storage/verification/preserved-inputs.json')['files'];assert len(protected)==2581
for p,d in protected.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==d.removeprefix('sha256:')
pkg=ROOT/'g1-storage';current=[]
def walk(p):
 for f in sorted(p.iterdir()):
  if f.name=='node_modules':continue
  assert not f.is_symlink()
  if f.is_dir():walk(f)
  else:current.append([str(f.relative_to(pkg)),hashlib.sha256(f.read_bytes()).hexdigest()])
walk(pkg);candidate={'digest':'sha256:'+hashlib.sha256(json.dumps(current,separators=(',',':')).encode()).hexdigest(),'files':len(current)}
assert candidate==read('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/candidate.json')=={'digest':'sha256:d68c41b546ba468bb73d068af01f3f896e98bba81ff22f585e4730d9bb61e5f2','files':1113}
proof=lines('preservation-final.stdout.log')[0];assert proof['candidate']==candidate and proof['predecessors']==[1106,1103,1100] and proof['recoveryPins']==14 and not proof['productQualification']
# Re-check the exact4036 captured historical inputs used by Turn109/110.
ext=read('g1-storage/verification/full-composition-extension-v1.json');transport=read('g1-storage/verification/measurement-transport-extension-v1.json');historical=0
excluded={'g1-storage/'+p for p in {*ext['files'],*transport['files']}}|{REPORT}
for b in read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn106/preservation-before.json')['files']:
 if b['path'] in excluded:continue
 verify(b);historical+=1
assert historical==4036
allocation=read(PREFIX+'/task-resource-allocation.json');assert len(allocation)==65
for t in allocation:
 for k in keys:
  if k!='checks':assert t[k]==tasks[t['id']][k]
 assert t['status']==tasks[t['id']]['status'] and len(t['checks'])==len(tasks[t['id']]['checks']) and t['team']==[]
 for c,actual in zip(t['checks'],tasks[t['id']]['checks']):
  for k,v in actual.items():assert c[k]==v
  assert c['outputOwner'] in tasks
  if c['script']:assert c['scriptExists']==(ROOT/c['script']).exists()
  if c['sourceFile']:assert c['sourceFilePresent']==(ROOT/c['sourceFile']).exists()
  assert c['missingIsImplementationOutput']==any(c[k] is False for k in ['scriptExists','registryPresent','sourceFilePresent'])
  assert (c['missingOutputOwner'] in tasks) if c['missingIsImplementationOutput'] else c['missingOutputOwner'] is None
  deepbindings(c['sourceBindings'])
chain=read(PREFIX+'/mandatory-repair-chain.json');assert [len(t['checks']) for t in chain]==[4,4,3]
assert [[c['timeout'] for c in t['checks']] for t in chain]==[[1800,900,120,900],[1800,900,120,900],[1800,900,900]]
assert chain[0]['id'] in chain[1]['depends_on'] and chain[1]['id'] in chain[2]['depends_on']
for t in chain:assert t['checks']==next(x for x in allocation if x['id']==t['id'])['checks']
scope=read(PREFIX+'/receipt-source-ownership.json');deepbindings(scope['existingAuthorizedSources']);deepbindings(scope['immutableDependencies']);verify(scope['proposal']);assert len(scope['existingAuthorizedSources'])==4 and scope['missingResources']==[]
cap=read(PREFIX+'/capacity-binding.json');assert cap['workEstimateMinutes']==sum(t['engineeringEstimateMinutes'] for t in allocation if t['status']!='done')==1800
assert cap['pipelineTotalMinutes']==sum(cap['pipelineEstimateMinutes'].values())==690 and cap['workAndPipelineEstimateMinutes']==2490
assert cap['policy']==goal['policy'] and cap['policy']['max_iterations'] is None and cap['policy']['max_hours'] is None
assert cap['teamLimit']==goal['agent'].get('team_limit',4)==4 and cap['maxDelegatedSeats']==0 and all(t['team']==[] for t in allocation);verify(cap['teamLimitSource'])
assert cap['remainingTurns'] is None and cap['remainingHours'] is None and not cap['accountingReset']
assert cap['originalStartedAt']==live['started_at'] and cap['approvedDigest']==live['approved_digest'] and cap['usage']==observed['usage']
for p in read(PREFIX+'/probes.json')+read(PREFIX+'/probe-retries.json')+[read(PREFIX+'/'+n) for n in ['preservation-probe.json','envelope-probe.json','sequential-probe.json']]:
 assert p['elapsedMs']<p['timeoutSeconds']*1000;deepbindings(p['streams'])
finalprobes=[p for p in read(PREFIX+'/probes.json') if p['name'] not in ['native-codec','preservation']]+[read(PREFIX+'/probe-retries.json')[0]]+[read(PREFIX+'/'+n) for n in ['preservation-probe.json','envelope-probe.json','sequential-probe.json']]
assert all(p['exitCode']==0 for p in finalprobes) and len(finalprobes)==14
native=lines('native-codec-retry.stdout.log')[0];assert native['nodeVersion']=='v22.22.3' and native['payloadBytes']==704053 and native['nativeStdoutBytes']>3_000_000
assert native['nativeLegacyRejected'] and native['nativeBase64Exact'] and native['strictUtf8Refusals']==6 and native['noncanonicalBase64Refusals']==5 and native['orderedChunks']==230 and native['closeAfterBothEnds'] and not native['productQualification']
for path,key in [('native-retry/native-tap-reporter.js','reporterDigest'),('native-retry/native-payload.json','payloadDigest'),('native-retry/native-child.stdout.log','nativeStdoutDigest')]:assert 'sha256:'+hashlib.sha256((BASE/path).read_bytes()).hexdigest()==native[key]
assert (BASE/'native-retry/native-tap-reporter.js').read_bytes()==(BASE.parent/'develop-turn110/node-v22.22.3-tap-reporter.js').read_bytes()
events=lines('five-container-envelope.stdout.log');envelope=next(e for e in events if e['measurement']=='five-concurrent-resource-envelope')
assert events[0]['preexistingContainers']==events[-1]['preexistingContainers']==[] and events[-1]['exactCensusUnchanged']
assert len(envelope['ready'])==5 and all(e['cpu']==1 and e['memoryBytes']==268435456 and e['pidsLimit']==128 and e['loopback'] and e['noBindMount'] for e in envelope['ready'])
cleanup=[e for e in events if e['measurement']=='resource-envelope-LIFO-cleanup'];assert [e['slot'] for e in cleanup]==['C','B','A','I','O'] and all(e['removed'] and e['exactCensusUnchanged'] and not Path(e['root']).exists() for e in cleanup)
seq=lines('sequential-resource.stdout.log');fresh=[e for e in seq if e['measurement']=='sequential-resource-fresh-sql'];assert len(fresh)==6
assert all(e['priorTableAbsent'] and e['ownCount']==1 and e['outerUnchanged'] and e['noResetOrParallelLifetime'] and e['peakContainers']==2 for e in fresh)
assert seq[0]['containers']==seq[-1]['containers']==[] and seq[-1]['exactCensus'] and len(seq[-1]['identities'])==7
assert all(e['rootAbsent'] and e['exactCensus'] and e['owned'] and not Path(e['root']).exists() for e in seq if e['measurement']=='sequential-resource-cleanup')
assert lines('primitives.stdout.log')[0]['census']['error']['code']=='EPERM'
assert read(PREFIX+'/controller-audit.stdout.log')['ok'] and read(PREFIX+'/controller-audit.stdout.log')['problems']==[]
attempt=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/official-attempt.json');deepbindings(attempt)
assert [r['result']['data']['status'] for r in attempt['runs']]==['fail','fail','pass','pass']
assert [r['tapTotals']['tests'] for r in attempt['runs'][:2]]==[187,61]
for r in attempt['runs'][:2]:assert r['admissionFailure']=='Interrupted full JSON observation/receipt' and not r['commandClock']['success'] and r['ownedBaselineRestored']
assert len(attempt['runs'][3]['children'])==63
w=read(PREFIX+'/workload-binding.json');verify(w['officialAttempt']);assert abs(w['LPlusVDispatchMs']-sum(r['dispatch']['elapsedMs'] for r in attempt['runs'][:2]))<1e-7
assert abs(w['LPlusVDispatchMs']-1175565.755834)<1e-7 and w['fullHarnessSeconds']==900 and w['aggregateSeconds']==1800 and not w['fullHarnessQualified'] and not w['aggregateQualified']
receipts=read(PREFIX+'/controller-results.json');assert receipts['jobId']=='job-54e0d9f181'
for cid,r in receipts['checks'].items():
 assert r['result']=={k:v for k,v in live['checks'][cid].items() if k!='tail'} and r['result']['status']=='pass'
 assert r['result']['duration_ms']<r['definition']['timeout']*1000;deepbindings(r['streams'])
 for s in r['streams']:assert (ROOT/s['copy']['path']).read_bytes()==(ROOT/s['original']['path']).read_bytes()
source=receipts['checks']['f05-04.source-content-component']['measurements'];assert next(r for r in source if r['measurement']=='storage-candidate')['digest']==candidate['digest']
test=next(r for r in source if r['measurement']=='storage-test-report')['reports'][0];assert test['tests']==12 and all(test[k]==0 for k in ['fail','cancelled','skipped','todo'])
assert all(v==0 for v in test['observations']['violations'].values()) and test['observations']['positives']['read']==4 and test['observations']['positives']['write']==3
assert next(r for r in source if r['measurement']=='storage-container-cleanup')['censusUnchanged'] and next(r for r in source if r['measurement']=='storage-root-cleanup')['removed']
retained=(ROOT/receipts['checks']['acceptance.retained-baselines']['streams'][0]['copy']['path']).read_text();assert [int(v) for v in re.findall(r'^# tests (\d+)$',retained,re.M)]==[197,48,5,9,10]
assert 'Electron 44.5.1 binary probe passed' in retained and 'Android Bundled' in retained and not re.search(r'^# (fail|cancelled|skipped|todo) [1-9]',retained,re.M)
assert 'timeout: 240_000' not in (pkg/'scripts/suite-execution.mjs').read_text()
doc=(ROOT/REPORT).read_text()
for link in re.findall(r'\]\(([^)]+)\)',doc):
 if bootstrap and link in ['readiness-turn112/audit-result.json','readiness-turn112/submission-binding.json']:continue
 assert (BASE.parent/link).exists(),link
for text in ['65 tasks / 109 checks / 96 requirements','43 done / 22 unfinished','1175565.755834','PLAN111-01','no global turn or wall-clock budget','1800s','900s','120s']:assert text in doc,text
assert all('X'+str(i).zfill(2) in doc for i in range(1,10))
if not bootstrap:
 seal=read(PREFIX+'/submission-binding.json');verify(seal['readiness'])
 for b in seal['files']:verify(b)
result={'ok':True,'candidate':candidate,'tasks':65,'checks':109,'requirements':96,'statusCounts':counts,'unfinished':22,'priorChecksPreserved':105,'completedHistoriesPreserved':43,'acyclic':True,'uncovered':[],'exactTestMatrixRows':96,'protectedInputs':2581,'capturedInputsUnchanged':len(preserved),'Turn109HistoricalInputsUnchanged':4036,'predecessorChain':[1106,1103,1100],'historicalRecoveryPins':14,'finalResourceProbes':14,'failedResourceProbeAttemptsRetained':3,'freshControllerJob':receipts['jobId'],'controllerPrerequisites':3,'nativeReporterPinned':True,'nativePayloadBytes':704053,'nativeOutputBytes':native['nativeStdoutBytes'],'strictUTF8Refusals':6,'noncanonicalBase64Refusals':5,'mandatoryRepairChainChecks':[4,4,3],'all20MissingChecksHaveOwners':True,'workEstimateMinutes':1800,'pipelineMinutes':690,'teamLimit':4,'delegatedSeats':0,'remainingTurnHourCapacityTest':'not applicable','bothOfficialCompleteCommandFailuresRetained':True,'LPlusVDispatchMs':w['LPlusVDispatchMs'],'fullHarnessQualified':False,'aggregateQualified':False,'externalQualification':False,'productionCodeChanged':False,'readiness':'Local prerequisites ready for independent plan review; repair/product acceptance pending'}
p=BASE/'audit-result.json'
if p.exists():assert read(PREFIX+'/audit-result.json')==result
else:write('audit-result.json',result)
print(json.dumps(result))
