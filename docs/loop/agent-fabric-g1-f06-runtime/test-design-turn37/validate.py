"""Read-only design diagnostics. No product checks/builds/processes/Docker/PG."""
from pathlib import Path
import json,hashlib,re,sys,math
here=Path(__file__).resolve().parent;root=here.parents[3];base=here.parent
out=Path(sys.argv[1]).resolve();assert not out.exists(),'Retain diagnostic attempts'
checks=[]
def record(name,observed):checks.append({'name':name,'observed':observed})
w=json.loads((here/'workload.json').read_text());text=(base/'test-plan.md').read_text();old=(here/'test-plan-before.md').read_text();invpath=root/w['inventory']['path'];inv=json.loads(invpath.read_text());ids=inv['ids'];families=inv['families']
assert hashlib.sha256(invpath.read_bytes()).hexdigest()==w['inventory']['sha256']=='47e12c9af887db0dfd7da75b89a8b1d3d66a9e0a8d364a376786fe04a817cd22'
assert len(ids)==5350
req=json.loads((base/'test-design-turn22/requirements-snapshot.json').read_text())
rows=[l for l in text.splitlines() if re.match(r'^\| [AIQB]\d{2} / (?:AF|UX)-|^\| R\d{2} / R-',l)]
mapped=[re.search(r' / ([A-Z]+-\d+(?:\.\d+)?) ',l)[1] for l in rows]
assert len(mapped)==len(set(mapped))==101 and set(mapped)=={r['id'] for r in req}
suites=set(inv['localSuites']);levels={'unit','integration','e2e','performance','security'}
for l in rows:
 c=[s.strip() for s in l.strip('|').split('|')];assert len(c)==5 and all(c);sl=c[1].split(';');assert sl[0].strip() in suites and sl[1].strip() in levels
fam=lambda t:[l for l in t.splitlines() if re.match(r'^\| ([AIQBRCEHPX]\d{2})(?=\s)',l)]
assert fam(text)==fam(old) and len(fam(text))==142
children=lambda t:re.findall(r'^\| P\d{2}/[a-z-]+;.*$',t,re.M)
assert children(text)==children(old) and len(children(text))==29
for n in range(4,13):
 section=lambda s:s.split('## '+str(n)+'.',1)[1].split('## '+str(n+1)+'.',1)[0]
 assert section(text)==section(old),n
record('requirements-oracles-measurement-preserved',{'requirements':101,'families':142,'ownerChildren':29,'sections4through12ByteEqual':True,'inventoryIds':5350})
runner=(root/'g1-runtime/scripts/runner.mjs').read_text();register=(root/'g1-runtime/tests/helpers/register-cases.ts').read_text()
assert 'timeoutMs=120000' in runner and 'await dispatch({file,selected,evidence:dir,candidate:built.candidate,requirements})' in runner
assert '--test-concurrency=1' in runner and "test(id,async()=>" in register
assert w['authorization']=={'questionId':'q-149465cbcd','answer':'Approve only the recovery-stop 300s inner ceiling; retain all outer limits','approved':True,'suite':'recovery-stop','fromMs':120000,'toMs':300000,'sourceApplied':False,'otherSuiteDeadlinesUnchanged':True,'outerCeilingsUnchanged':True,'fullMatrixFitClaim':False}
assert w['bounds']['sourceRecoveryInnerMs']==120000 and w['bounds']['authorizedRecoveryInnerMs']==300000
assert w['serialSamples']['combinedMinimumMs']==30*3000+1000+30000==121000
prefixes=inv['componentViews']['continuation'];selected=[i for i in ids if any(i==p or i.startswith(p+'/') for p in prefixes)]
assert 'R19' in prefixes and 'R19/full' in selected and 'R20/full' not in selected and len(selected)==2487
assert len([i for i in selected if families[i.split('/')[0]]['suite']=='recovery-stop'])==2485
assert w['inventory']['continuationOtherSuites']=={'authority-intent':['A13/full'],'egress':['A11/full']}
assert 'INCLUDES R19' in text and 'R20/full' in text and 'LESS than300s' in text
record('actual-source-versus-approved-deadline-and-corrected-continuation',{'sourceRecoveryMs':120000,'approvedRecoveryMs':300000,'outerContinuationMs':300000,'serialMinimumMs':121000,'continuationIds':2487,'includesR19':True,'includesR20':False,'implementationApplied':False})
js=w['matrix']['journeys'];assert len(js)==2488 and len({j['caseId'] for j in js})==2475 and len({j['branchId'] for j in js})==2488
assert sum(j['minimumActualExpiryMs'] for j in js)==4476000 and sum(j['minimumActualExpiryMs']>0 for j in js)==1492
assert all(j['independentOriginalRequired'] and j['freshOwnerOSProcessRequired'] and j['freshRecoveredGETRequired'] and j['usefulDistinctSuccessorRequired'] for j in js)
assert w['bounds']['minimumFunctionalParallelismIgnoringAllOtherCosts']==math.ceil(4476000/(300000-121000))==26
pilot=[j for j in js if j['pilotSchemaField']];assert len(pilot)==18 and len(set(j['pilotSchemaField'] for j in pilot))==14
assert [sum(j['path']==p for j in pilot) for p in json.loads((base/'test-design-turn22/case-subsets.json').read_text())['paths']]==[4,4,3,3,4]
manifest=json.loads((here/'partition-manifest.json').read_text());recovery=[i for i in ids if families[i.split('/')[0]]['suite']=='recovery-stop'];assert manifest['caseUniverse']==recovery
for lanes,p in manifest['candidates'].items():
 serial=p['exclusivePhase'];parts=p['functionalPartitions'];assert serial==['A12/full','R19/full'] and len(parts)==int(lanes)
 actual=serial+[i for r in parts for i in r['selected']]
 assert len(actual)==len(set(actual))==len(recovery) and set(actual)==set(recovery)
 for r in parts:assert r['minimumExpiryMs']==sum(j['minimumActualExpiryMs'] for j in js if j['caseId'] in r['selected'])
 assert p['fixedCriticalWaitLowerBoundMs']==121000+max(r['minimumExpiryMs'] for r in parts)
 assert p['actualTimingProved'] is False and p['fit'] is None and p['nonWaitCostsMissing']
assert [manifest['candidates'][str(n)]['fixedCriticalWaitLowerBoundMs'] for n in [1,4,8,16,32,64]]==[4597000,1240000,682000,403000,262000,193000]
assert manifest['selectedLaneCount'] is None and manifest['runtimeFitClaim'] is False
record('independent-minimum-branch-ledger-and-exact-exhaustive-disjoint-partitions',{'normativeMatrixIds':2475,'minimumJourneys':2488,'expiredOriginals':1492,'serialFunctionalExpiryMs':4476000,'minimumLanesIgnoringOtherCosts':26,'partitionCandidates':[1,4,8,16,32,64],'selectedLaneCount':None,'runtimeFitProved':False})
tasks=w['proposedTasks'];rs={r['id']:r for r in tasks};assert len(rs)==14
for r in tasks:
 assert r['team']==[] and r['upperTotalMinutes']==r['implementationMinutes'][1]+r['wholeCheckSeconds']/60+10<=120
 assert r['wholeCheckSeconds']==sum(c['timeout'] for c in r['checks'])
 assert r['status']=='proposed-not-submitted' and r['resourcesIndependentlyReviewed'] is False and r['runtimeFit'] is False
 if r['expandedIds'] is not None:
  expanded=[i for i in ids if any(i==p or i.startswith(p+'/') for p in r['selectors'])];assert set(expanded)==set(r['expandedIds'])
 for c in r['checks']:
  if '--cases ' in c['run']:
   for p in c['run'].split('--cases ',1)[1].split():assert any(i==p or i.startswith(p+'/') for i in ids),p
prior=json.loads((base/'test-design-turn36/workload.json').read_text());pr={r['id']:r for r in prior['proposedTasks']}
for id in ['f06-06c','f06-06d','f06-06e']:
 assert rs[id]['checks']==pr[id]['checks'] and rs[id]['selectors']==pr[id]['selectors'] and rs[id]['expandedIds']==pr[id]['expandedIds']
for p,suffixes,count in [('f06-06c',['auth','get','quiescence'],1425),('f06-06d',['atomicity','faults','concurrent','replay'],1035)]:
 leaves=[i for s in suffixes for i in rs[p+'-'+s]['expandedIds']];assert len(leaves)==len(set(leaves))==count and set(leaves)==set(rs[p]['expandedIds'])
seen=set();active=set()
def visit(k):
 if k in seen or k not in rs:return
 assert k not in active,k
 active.add(k)
 for d in rs[k]['depends_on']:visit(d)
 active.remove(k);seen.add(k)
for k in rs:visit(k)
assert (sum(r['implementationMinutes'][0] for r in tasks),sum(r['implementationMinutes'][1] for r in tasks),sum(r['wholeCheckSeconds'] for r in tasks))==(565,980,7140)
assert '824–1239min' in text
record('bounded-proposed-DAG-original-parent-checks-unchanged',{'tasks':14,'implementationMinutes':[565,980],'wholeCheckSeconds':7140,'handoffMinutes':140,'maximumTurnEstimate':max(r['upperTotalMinutes'] for r in tasks),'officialPlanSubmitted':False,'independentResourceSignoff':False})
for p in [base/'readiness.md',root/'docs/planning/g1-f06-plan.md']:
 s=p.read_text();assert 'Turn37 execution overlay' in s and '300s' in s and '121s' in s
 assert s.split('## ',1)[1]==(here/('readiness-before.md' if p.name=='readiness.md' else 'planning-before.md')).read_text().split('## ',1)[1]
assert 'NO-GO' in (base/'readiness.md').read_text()
assert w['stageComplete'] is False and w['productionChanged'] is False and w['officialPlanChanged'] is False and w['executionReadiness']=='NO-GO' and w['feasible'] is None
assert w['findings']=={'PR-F06-08':'open','PR-F06-09':'open'}
assert '**loop_stage_done(test_design) is not called**' in text
record('stage-boundaries-and-explicit-readiness-overlays',{'stageComplete':False,'findingsOpen':True,'sourceChanged':False,'runtimeTestsRun':False,'noDocker':True,'remoteUnapproved':True})
initial=json.loads((here/'initial-files.json').read_text());allowed={'docs/loop/agent-fabric-g1-f06-runtime/test-plan.md','docs/loop/agent-fabric-g1-f06-runtime/readiness.md','docs/planning/g1-f06-plan.md'};changed=[]
for p,meta in initial['files'].items():
 if p in allowed:continue
 f=root/p
 if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=meta['sha256']:changed.append(p)
assert not changed,changed
record('scoped-snapshot-preservation',{'unchangedFiles':len(initial['files'])-len(allowed),'intentionallyChangedDocs':sorted(allowed),'exclusions':initial['exclusions'],'fullRawEvidenceHashAuditClaim':False,'interruptedInitialTraversal':True,'beforeTestPlanMatchesTurn36FinalHash':initial['testPlanBeforeReconstructedAgainstTurn36Digest']})
result={'kind':'design-only-diagnostics','success':True,'checks':checks,'currentDocuments':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [base/'test-plan.md',base/'readiness.md',root/'docs/planning/g1-f06-plan.md']},'notRuntimeQualification':True,'stageComplete':False}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'success':True,'groups':len(checks),'unchangedSnapshotFiles':len(initial['files'])-3,'stageComplete':False,'runtimeFit':None}))
