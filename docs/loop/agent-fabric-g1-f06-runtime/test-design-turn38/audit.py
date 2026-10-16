"""Read-only design/raw audit. No builds, Docker, processes or product pass."""
from pathlib import Path
import hashlib,json,re,sys
h=Path(__file__).resolve().parent;b=h.parent;root=h.parents[3]
out=Path(sys.argv[1]).resolve();assert not out.exists(),'Retain audit attempts'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
findings=[]
def ok(name,detail):findings.append({'name':name,'detail':detail})
initial=json.loads((h/'initial-files.json').read_text())
changed=[]
for p,digest in initial['files'].items():
 if sha(root/p)!=digest:changed.append(p)
allowed={str((b/'test-plan.md').relative_to(root)),str((b/'readiness.md').relative_to(root)),'docs/planning/g1-f06-plan.md'}
assert set(changed)<=allowed,changed
acceptance=root/'docs/evidence/g1-f06-acceptance.md'
assert acceptance.read_bytes().startswith((h/'acceptance-before.md').read_bytes()),'Only append living F06 evidence; preserve prior text'
ok('preserved-current-product-candidate-and-prior-task-snapshot',{'unchanged':len(initial['files'])-len(changed),'intendedDocumentChanges':changed,'fullRawTreeReaudit':False})
text=(b/'test-plan.md').read_text();old=(h/'test-plan-before.md').read_text()
for n in range(4,13):
 def section(s):return s.split('## '+str(n)+'.',1)[1].split('## '+str(n+1)+'.',1)[0]
 assert section(text)==section(old),n
rows=[l for l in text.splitlines() if re.match(r'^\| [AIQB]\d{2} / (?:AF|UX)-|^\| R\d{2} / R-',l)]
mapped=[re.search(r' / ([A-Z]+-\d+(?:\.\d+)?) ',l)[1] for l in rows]
req=json.loads((b/'test-design-turn22/requirements-snapshot.json').read_text())
assert len(mapped)==len(set(mapped))==101 and set(mapped)=={r['id'] for r in req}
inv=json.loads((root/'g1-runtime/verification/case-inventory.json').read_text())
assert len(inv['ids'])==5350 and sha(root/'g1-runtime/verification/case-inventory.json')=='47e12c9af887db0dfd7da75b89a8b1d3d66a9e0a8d364a376786fe04a817cd22'
assert len(re.findall(r'^\| ([AIQBRCEHPX]\d{2})(?=\s)',text,re.M))==142
assert len(re.findall(r'^\| P\d{2}/[a-z-]+;.*$',text,re.M))==29
ok('all-requirement-cases-levels-oracles-and-samples-preserved',{'requirements':101,'families':142,'ownerChildren':29,'inventory':5350,'sections4through12ByteEqual':True})
binding=json.loads((h/'specimen-inputs.json').read_text())
for p,digest in binding.items():assert sha(h/p)==digest
reports=[]
for p in sorted(h.glob('profile-*/result.json')):
 r=json.loads(p.read_text());assert r['acceptance'] is False and r['fullMatrixFit'] is False and r['remoteQualified'] is False
 for phase in r['phases']:
  for d in phase['dispatches']:
   child=p.parent/('lanes-'+str(phase['lanes'])+'-child-'+str(d['lane']))
   s=json.loads((child/'supervisor.json').read_text());assert s['streamsComplete']
   for name,m in s['rawStreams'].items():assert (child/name).stat().st_size==m['bytes'] and sha(child/name)==m['sha256']
   if d['success']:
    assert s['cleanup']['confirmed']
    for name,m in d['raw'].items():assert (child/name).stat().st_size==m['bytes'] and sha(child/name)==m['sha256']
    assert s['nonce']==d['nonce'];assert s['exit']=={'status':0,'signal':None};assert not s['timedOut']
    events=[json.loads(l) for l in (child/'events.ndjson').read_text().splitlines()]
    summaries=[e['data'] for e in events if e['type']=='test:summary' and 'file' not in e['data']]
    assert len(summaries)==1;summ=summaries[0];assert summ['success'];assert summ['counts']['tests']==5 and summ['counts']['passed']==5
    assert all(summ['counts'][k]==0 for k in ['failed','cancelled','skipped','todo'])
    assert d['branches']==18 and d['actualExpiryOriginals']==10
    roots=[json.loads(l) for l in (child/'births.ndjson.design-targets').read_text().splitlines()]
    assert len(roots)==18 and len({x['root'] for x in roots})==18
    assert all(not Path(x['root']).exists() and not Path(x['root']).parent.exists() for x in roots),'Fixture directory residue'
    assert {x['pid'] for x in roots}=={x['targetPid'] for x in d['operations']}
    assert all(x['nonce']==d['nonce'] and any(o['pid']==x['pid'] and o['ppid']==x['ppid'] and o['nonce']==x['nonce'] for o in s['owned']) for x in roots)
 reports.append((p,r))
assert len(reports)>=2 and reports[0][1]['success'] is False,'Retain first collector failure'
assert reports[0][1]['phases'][0]['lanes']==1 and len(reports[0][1]['phases'])==1
ok('all-retained-profile-streams-births-roots-and-TAP',{'runs':len(reports),'firstFailureRetained':True,'passingDispatchRootAbsenceObservedAtAudit':True})
latest_path,latest=reports[-1]
assert latest['success'] is False and latest['cleanup'] and latest['specimenSha256']==binding['profile.mjs']
assert 'Resource guard reached' in latest['error']
assert [p['lanes'] for p in latest['phases']]==[1,2,4,8]
assert all(p['durationMs']<=120000 and len(p['dispatches'])==p['lanes'] for p in latest['phases'])
assert all(p['success'] for p in latest['phases'][:3]) and latest['phases'][3]['success'] is False
assert all(d['success'] is False for d in latest['phases'][3]['dispatches'])
assert latest['durationMs']<460000 and latest['perChildMaximumMs']==120000
assert latest['uniqueOriginals']==latest['uniqueSuccessors']==latest['uniqueFixtureRoots']==18*7==126
ops=[o for p in latest['phases'] for d in p['dispatches'] if d['success'] for o in d['operations']]
originals={o['operationId'] for o in ops};successors={o['successorOperationId'] for o in ops}
assert len(originals)==len(successors)==126 and not originals&successors
assert len({o['fixtureRootDigest'] for o in ops})==126
assert all(o['negativeGet']['operationId']==o['operationId']==o['restoredGet']['operationId'] and o['negativeGet']['method']==o['restoredGet']['method']=='GET' and o['negativeGet']['at']<=o['restoredGet']['at'] for o in ops)
assert all(len(set(o['ownerPids']))==2 for o in ops)
for p in latest['phases'][:3]:
 assert len(p['samples'])>=2
 assert all(s['freeBytes']>=latest['guards']['minimumFreeBytes'] and s['ownedRssBytes']<=latest['guards']['maximumOwnedRssBytes'] for s in p['samples'])
assert max(s['ownedRssBytes'] for s in latest['phases'][3]['samples'])>latest['guards']['maximumOwnedRssBytes']
failed=[]
for d in latest['phases'][3]['dispatches']:
 p=latest_path.parent/('lanes-8-child-'+str(d['lane']))/'supervisor.json';s=json.loads(p.read_text());assert s['cleanup']['confirmed'] is False;failed.append(p)
recoveries=[(p,json.loads(p.read_text())) for p in h.glob('process-recovery-*.json')]
good=[(p,r) for p,r in recoveries if r['pass']]
assert len(good)>=2,'Precheck and separate task-completion fresh census required'
for p,r in good:
 assert r['censusPerformed'] and not r['before'] and not r['after'] and not r['signals']
 assert len(r['retainedFixtureRoots'])==5
 for s in r['sourceReports']:assert sha(Path(s['path']))==s['sha256']
 for f in r['retainedFixtureRoots']:
  p=Path(f['path']);assert p.is_dir();owner=json.loads((p.parent/'.runtime-owner.json').read_text());assert owner['path']==str(p.parent)
ok('bounded-concurrency-guard-failure-and-fresh-process-recovery',{'report':str(latest_path.relative_to(root)),'uniquePassingOriginals':126,'actualPassingExpiryOriginals':70,'maximumCompletePassingLanes':4,'failedLanes':8,'historicalFailedCleanupReports':len(failed),'freshRecoveryPasses':len(good),'retainedFixtureRoots':5,'fullMatrixFit':False})
branches=(h/'nonmatrix-branches.md').read_text()
remaining=['A04/full','A10/full','A12/full','A14/full','A15/full','A16/executable-continuation-currentness','A17/full','A18/legacy-release-expiry-resend-new-key-unavailable-lookup','R18/native-monotonic-stop-parent-child-stale-progress-and-unrelated-pid','R19/full','A11/full','A13/full']
assert all('| '+x+';' in branches for x in remaining) and 'R20/full' in branches
assert '1s AND 30s' in branches and '30 serial' in branches and '2,000 bootstrap' in branches
assert 'PR-F06-08/09 remain open' in text and 'turn38' in text and 'loop_stage_done' in text
assert 'not submitted' in text and 'NO-GO' in (b/'readiness.md').read_text()
snapshot=json.loads((h/'controller-task-snapshot.json').read_text())
assert snapshot['officialRemainingImplementationSplitSubmitted'] is False and snapshot['planFinal'] is False
diagnostic=next(t for t in snapshot['tasks'] if t['id']=='f06-test-design-profile')
assert len(diagnostic['checks'])==1 and diagnostic['checks'][0]['timeout']==480
proposal=json.loads((h/'proposed-task-payload.json').read_text());tasks=proposal['tasks'];assert len(tasks)==15
assert max(t['upperTotalMinutes'] for t in tasks)<=120
assert all(t['resourcesIndependentlyReviewed'] is False and t['runtimeFit'] is False for t in tasks)
oldtasks=json.loads((b/'test-design-turn37/proposed-task-payload.json').read_text())['tasks']
for i in ['f06-06c','f06-06d','f06-06e']:
 assert next(t for t in tasks if t['id']==i)['checks']==next(t for t in oldtasks if t['id']==i)['checks']
ok('branch-denominators-authorization-and-official-plan-limits',{'continuationAdditionalOwningIds':12,'R20outsideContinuation':True,'implementationDAGSubmitted':False,'diagnosticOnlyOfficialTask':diagnostic['id'],'proposedTasks':15,'stageComplete':False})
result={'kind':'design-and-raw-diagnostics-only','success':True,'checks':findings,'acceptance':False,'fullMatrixFit':False,'stageComplete':False,'documentBindings':{str(p.relative_to(root)):sha(p) for p in [b/'test-plan.md',b/'readiness.md',root/'docs/planning/g1-f06-plan.md',acceptance,h/'nonmatrix-branches.md',h/'profile.mjs',h/'birth-details.mjs']}}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'success':True,'diagnosticGroups':len(findings),'output':str(out)}))
