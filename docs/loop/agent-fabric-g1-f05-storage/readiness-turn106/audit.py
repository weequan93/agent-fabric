"""Read-only current readiness audit; only its initial result file is written."""
import hashlib,json,re,sys,io,contextlib
from pathlib import Path
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[3];PREFIX=str(BASE.relative_to(ROOT));REPORT=str(BASE.parent.relative_to(ROOT))+'/readiness.md'
assert sys.argv[1:] in [[],['--bootstrap']];bootstrap=sys.argv[1:]==['--bootstrap']
def read(p):return json.loads((ROOT/p).read_text())
def digest(b):return hashlib.sha256(b).hexdigest()
def verify(b,path=None):
 p=ROOT/(path or b['path']);assert p.is_file() and not p.is_symlink(),p;raw=p.read_bytes();assert len(raw)==b['bytes'] and digest(raw)==b['sha256'].removeprefix('sha256:'),p
def records(name):return [json.loads(s) for s in (BASE/name).read_text().splitlines()]
live=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json');before=read(PREFIX+'/controller-before.json');observed=read(PREFIX+'/controller-observed.json');plan=read(PREFIX+'/current-plan.json');keys=['id','title','detail','covers','depends_on','role','team','checks']
assert before['tasks']==observed['tasks']==live['tasks'],'No task mutation during resources'
assert goal==read(PREFIX+'/goal-before.json')==read(PREFIX+'/goal-observed.json')
assert plan['tasks']==[{k:t[k] for k in keys} for t in live['tasks']]
assert plan['requirements']==before['requirements']==live['requirements'] and live['requirements_final']
assert (len(live['tasks']),sum(len(t['checks']) for t in live['tasks']),len(live['requirements']))==(64,105,96)
assert {s:sum(t['status']==s for t in live['tasks']) for s in ['done','pending','active']}=={'done':42,'pending':21,'active':1}
assert all(t['team']==[] for t in live['tasks'])
# Independently execute only the read-only body of the retained exact amendment audit.
# The original script and its sealed output remain untouched.
oldcode=(BASE.parent/'develop-turn104/plan-audit.py').read_text()
last="(h/'plan-audit-result.json').write_text(json.dumps(report,indent=2)+'\\n');print(json.dumps(report))"
assert oldcode.count(last)==1
with contextlib.redirect_stdout(io.StringIO()):exec(compile(oldcode.replace(last,''),'retained-plan-audit-read-only','exec'),{})
preserved=read(PREFIX+'/preservation-before.json')['files']
for b in preserved:verify(b,PREFIX+'/readiness-turn102-preserved.md' if b['path']==REPORT else None)
for name in ['reuse-readiness102.json','reuse-turn104.json']:
 reused=read(PREFIX+'/'+name);verify(reused['source'])
 for b in reused['sealedArtifacts']:verify(b)
 if reused['preservedReadiness']:verify(reused['preservedReadiness'])
oldseal=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn102/submission-binding.json')
verify(oldseal['readiness'],PREFIX+'/readiness-turn102-preserved.md')
# Reconstruct every original package byte and fourteen recovery pins.
pkg=ROOT/'g1-storage';predecessor=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/predecessor.json');extension=read('g1-storage/verification/execution-extension-v1.json')
def reconstructed(path):
 raw=(pkg/path).read_bytes();entry=extension['files'].get(path)
 if entry:
  assert 'sha256:'+digest(raw)==entry['currentDigest'];text=raw.decode()
  for c in reversed(entry['changes']):
   if c.get('prefix'):assert text.startswith(c['after']);text=text[len(c['after']):]
   else:assert text.count(c['after'])==1;text=text.replace(c['after'],c['before'])
  raw=text.encode();assert 'sha256:'+digest(raw)==entry['predecessorDigest']
 return raw
assert len(predecessor)==1100
for path,sha in predecessor.items():assert digest(reconstructed(path))==sha.removeprefix('sha256:'),path
pins=read('g1-storage/verification/owned-recovery-pins.json')['files'];assert len(pins)==14
for path,sha in pins.items():
 raw=reconstructed(path.removeprefix('g1-storage/')) if path.startswith('g1-storage/') else (ROOT/path).read_bytes()
 assert digest(raw)==sha.removeprefix('sha256:'),path
allocation=read(PREFIX+'/task-resource-allocation.json');assert len(allocation)==64
tasks={t['id']:t for t in live['tasks']}
for t in allocation:
 for key in keys:
  if key!='checks':assert t[key]==tasks[t['id']][key]
 assert t['status']==tasks[t['id']]['status'] and len(t['checks'])==len(tasks[t['id']]['checks'])
 for c,actual in zip(t['checks'],tasks[t['id']]['checks']):
  for k,v in actual.items():assert c[k]==v
  script=re.match(r'^node ([^ ]+)',c['run']);assert c['scriptExists']==(ROOT/script[1]).exists()
  if c['missingIsImplementationOutput']:assert c['missingOutputOwner'] in tasks
  else:assert c['missingOutputOwner'] is None
repairs=read(PREFIX+'/repair-checks.json');assert [t['engineeringEstimateMinutes'] for t in repairs]==[65,110];assert sum(len(t['checks']) for t in repairs)==6
assert {c['run'] for t in repairs for c in t['checks'] if not c['scriptExists']}=={'node g1-storage/scripts/check-execution-measurement.mjs','node g1-storage/scripts/check-full-predecessor-composition.mjs'}
cap=read(PREFIX+'/capacity-binding.json');assert cap['workEstimateMinutes']==sum(t['engineeringEstimateMinutes'] for t in allocation if t['status']!='done')==1800
assert cap['pipelineTotalMinutes']==sum(cap['pipelineEstimateMinutes'].values())==690
assert cap['workAndPipelineEstimateMinutes']==2490 and cap['policy']==goal['policy']
assert cap['policy']['max_iterations'] is None and cap['policy']['max_hours'] is None
assert cap['policy']['turn_timeout_minutes']==120 and cap['remainingTurns'] is None and cap['remainingHours'] is None
assert all(t['engineeringEstimateMinutes']<=120 for t in allocation if t['status']!='done')
assert cap['teamLimit']==goal['agent'].get('team_limit',4)==4 and cap['maxDelegatedSeats']==0;verify(cap['teamLimitSource'])
assert cap['originalStartedAt']==live['started_at'] and cap['approvedDigest']==live['approved_digest'] and cap['usage']==observed['usage'] and not cap['accountingReset']
for p in read(PREFIX+'/probes.json')+[read(PREFIX+'/'+n) for n in ['envelope-probe.json','sequential-probe.json','execution-preservation-probe.json']]:
 assert p['exitCode']==0 and p['elapsedMs']<p['timeoutSeconds']*1000
 for b in p['streams']:verify(b)
primitives=records('primitives.stdout.log')[0];assert primitives['census']['status'] is None and primitives['census']['error']['code']=='EPERM'
drains=records('drain-resource.stdout.log');assert [d['path'] for d in drains]==['success','fatal']
for d in drains:
 assert d['stdoutBytes']>66112 and d['completePrefixFinalAndDiagnostic'] and d['closeAfterBothStreams'] and not d['productTransportQualified']
 assert d['status']==(1 if d['path']=='fatal' else 0) and d['signal'] is None
 for channel in ['stdout','stderr']:
  raw=(BASE/('drain-'+d['path']+'.'+channel+'.log')).read_bytes();assert len(raw)==d[channel+'Bytes'] and digest(raw)==d[channel+'Hash']
events=records('five-container-envelope.stdout.log');assert events[0]['preexistingContainers']==events[-1]['preexistingContainers']==[] and events[-1]['exactCensusUnchanged']
envelope=next(e for e in events if e['measurement']=='five-concurrent-resource-envelope');assert len(envelope['ready'])==len(envelope['stats'])==5
assert [x['slot'] for x in envelope['ready']]==['O','I','A','B','C']
assert all(x['cpu']==1 and x['memoryBytes']==268435456 and x['pidsLimit']==128 and x['loopback'] and x['noBindMount'] and x['backendPid']>0 for x in envelope['ready'])
for k in ['containerId','owner','instance','rootId']:assert len({x[k] for x in envelope['ready']})==5
barrier=next(e for e in events if e['measurement']=='five-concurrent-sql-barrier');assert barrier['connectedBeforeDispatch']==5 and barrier['actualConcurrentQueries']
cleanup=[e for e in events if e['measurement']=='resource-envelope-LIFO-cleanup'];assert [e['slot'] for e in cleanup]==['C','B','A','I','O']
assert all(e['removed'] and e['exactCensusUnchanged'] and not Path(e['root']).exists() for e in cleanup)
seq=records('sequential-resource.stdout.log');fresh=[e for e in seq if e['measurement']=='sequential-resource-fresh-sql']
assert [e['slot'] for e in fresh]==['L-retention','L-graph','L-maintenance','L-retry','V-drafts','V-promotion']
assert all(e['priorTableAbsent'] and e['ownCount']==1 and e['outerUnchanged'] and e['noResetOrParallelLifetime'] and e['peakContainers']==2 for e in fresh)
clean=[e for e in seq if e['measurement']=='sequential-resource-cleanup'];assert [e['slot'] for e in clean]==[e['slot'] for e in fresh]+['O']
assert all(e['exactCensus'] and e['rootAbsent'] and e['owned'] and not Path(e['root']).exists() for e in clean)
assert seq[0]['containers']==seq[-1]['containers']==[] and seq[-1]['exactCensus'] and len(seq[-1]['identities'])==7
receipts=read(PREFIX+'/controller-results.json');assert receipts['jobId']=='job-e0966722ed'
for cid,receipt in receipts['checks'].items():
 result=receipt['result'];assert result=={k:v for k,v in live['checks'][cid].items() if k!='tail'}
 assert result['status']=='pass' and result['exit_code']==0 and result['duration_ms']<receipt['definition']['timeout']*1000
 for s in receipt['streams']:verify(s['original']);verify(s['copy']);assert (ROOT/s['original']['path']).read_bytes()==(ROOT/s['copy']['path']).read_bytes()
source=receipts['checks']['f05-04.source-content-component']['measurements'];candidate=next(x for x in source if x['measurement']=='storage-candidate')
assert candidate['digest']=='sha256:22caabb0e47f1820e7211f70ea4f9f2ffce73912e1178e280c2288d875de3157' and candidate['files']==1103
case=next(x for x in source if x['measurement']=='storage-test-report')['reports'][0];assert case['tests']==len(case['executions'])==12
assert all(case[k]==0 for k in ['fail','cancelled','skipped','todo']) and all(v==0 for v in case['observations']['violations'].values())
assert case['observations']['positives']['read']==4 and case['observations']['positives']['write']==3
assert next(x for x in source if x['measurement']=='storage-container-cleanup')['censusUnchanged'] and next(x for x in source if x['measurement']=='storage-root-cleanup')['removed']
retained=(ROOT/receipts['checks']['acceptance.retained-baselines']['streams'][0]['copy']['path']).read_text()
assert [int(x) for x in re.findall(r'^# tests ([0-9]+)$',retained,re.M)]==[197,48,5,9,10]
assert not re.search(r'^# (fail|cancelled|skipped|todo) [1-9]',retained,re.M) and 'Electron 44.5.1 binary probe passed' in retained and 'Android Bundled' in retained
w=read(PREFIX+'/workload-binding.json');assert w['LPlusVDispatchMs']==1163612.160583 and not w['fullHarnessQualified'] and not w['aggregateQualified']
for key in ['completeFailureStreams','timingLedger','childExports']:verify(w[key])
assert w['fullHarnessSeconds']==900 and w['aggregateSeconds']==1800 and w['maxNestedContainers']==5
assert 'timeout: 240_000' not in (pkg/'scripts/suite-execution.mjs').read_text()
doc=(ROOT/REPORT).read_text()
for link in re.findall(r'\]\(([^)]+)\)',doc):
 if bootstrap and link in ['readiness-turn106/audit-result.json','readiness-turn106/submission-binding.json']:continue
 assert (BASE.parent/link).exists(),link
for text in ['64 tasks / 105 checks / 96 requirements','42 done / 22 unfinished','1163612.160583','remaining-turn/hour and deficit tests not applicable','65m','110m','900s','1800s','PLAN105-01']:assert text in doc,text
assert all('X'+str(i).zfill(2) in doc for i in range(1,10))
if not bootstrap:
 seal=read(PREFIX+'/submission-binding.json');verify(seal['readiness'])
 for b in seal['files']:verify(b)
result={'ok':True,'tasks':64,'checks':105,'requirements':96,'done':42,'unfinished':22,'pending':21,'active':1,'priorChecksPreserved':99,'completedHistoriesPreserved':42,'acyclic':True,'uncovered':[],'candidate':w['candidate'],'protectedInputs':2581,'predecessorBytesReconstructed':1100,'historicalRecoveryPins':14,'capturedInputsUnchanged':len(preserved),'resourceProbes':14,'freshControllerJob':receipts['jobId'],'controllerPrerequisites':3,'allThreeTurn104Gates':'fail','completeChildExports':61,'drainResourcePaths':['success','fatal'],'fivePGResourceEnvelope':True,'sequentialIndependentSQLFixtures':6,'LIFO':['C','B','A','I','O'],'repairTasks':2,'repairChecks':6,'plannedMissingCheckerScripts':2,'workEstimateMinutes':1800,'pipelineMinutes':690,'remainingTurnHourCapacityTest':'not applicable','teamLimit':4,'delegatedSeats':0,'fullHarnessQualified':False,'aggregateQualified':False,'externalQualification':False,'productionCodeChanges':False,'qualification':'Local resources ready for independent plan review; repair and full workload acceptance pending'}
p=BASE/'audit-result.json'
if p.exists():assert read(PREFIX+'/audit-result.json')==result
else:p.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
