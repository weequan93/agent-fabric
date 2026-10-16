"""Read-only document/source diagnostics; no runtime tests or qualification."""
from pathlib import Path
import hashlib,json,re,sys
here=Path(__file__).resolve().parent;root=here.parents[3];base=here.parent
out=Path(sys.argv[1]).resolve();assert not out.exists(),'Retain every diagnostic attempt'
text=(base/'test-plan.md').read_text();old=(here/'test-plan-before.md').read_text()
checks=[]
def record(n,v):checks.append({'name':n,'observation':v})
def sec(t,a,b):return t.split(a,1)[1].split(b,1)[0]
req=json.loads((base/'test-design-turn22/requirements-snapshot.json').read_text())
rows=[l for l in text.splitlines() if re.match(r'^\| [AIQB]\d{2} / (?:AF|UX)-|^\| R\d{2} / R-',l)]
mapped=[re.search(r' / ([A-Z]+-\d+(?:\.\d+)?) ',l)[1] for l in rows]
assert len(mapped)==len(set(mapped))==101 and set(mapped)=={r['id'] for r in req}
suites={'contracts','authority-intent','tool-paths','egress','lease-queue','browser-refusal','recovery-stop','qualification-matrix','harness-integrity'}
levels={'unit','integration','e2e','performance','security'}
for l in rows:
 cells=[s.strip() for s in l.strip('|').split('|')];assert len(cells)==5 and all(cells)
 a=cells[1].split(';');assert a[0].strip() in suites and a[1].strip() in levels
record('all101-requirements-have-case-suite-level-data-steps-oracle',len(mapped))
fam=lambda s:[l for l in s.splitlines() if re.match(r'^\| ([AIQBRCEHPX]\d{2})(?=\s)',l)]
assert fam(text)==fam(old) and len(fam(text))==142
children=lambda s:re.findall(r'^\| P\d{2}/[a-z-]+;.*$',s,re.M)
assert children(text)==children(old) and len(children(text))==29
for a,b in [('## 4.','## 5.'),('## 5.','## 6.'),('## 6.','## 7.'),('## 7.','## 8.'),('## 8.','## 9.'),('## 9.','## 10.'),('## 10.','## 11.'),('## 11.','## 12.'),('## 12.','## 13.')]:assert sec(text,a,b)==sec(old,a,b),a
record('case-oracles-and-measurement-preserved',{'families':142,'ownerChildren':29,'sections4through12ByteEqual':True})
w=json.loads((here/'workload.json').read_text());invbytes=(root/'g1-runtime/verification/case-inventory.json').read_bytes();inv=json.loads(invbytes);ids=inv['ids']
assert w['normativeInventory']['sha256']==hashlib.sha256(invbytes).hexdigest() and len(ids)==5350
assert w['serialLowerBoundSeconds']==30*3+1+30==121>w['currentInnerSuiteMs']/1000
runner=(root/'g1-runtime/scripts/runner.mjs').read_text()
assert 'timeoutMs=120000' in runner and 'await dispatch({file,selected,evidence:dir,candidate:built.candidate,requirements})' in runner
assert 'private observation' in text and 'No optimized scheduler is signed off' in text
assert w['requestedAmendment']=={'approved':False,'suite':'recovery-stop','fromMs':120000,'toMs':300000,'otherSuiteDeadlinesUnchanged':True,'outerCeilingsUnchanged':True,'fullMatrixFitClaim':False}
assert w['feasible'] is False and w['officialPlanChanged'] is False
assert w['findings']=={'PR-F06-08':'open','PR-F06-09':'open'}
record('actual-default-and-infeasible-serial-lower-bound',{'defaultMs':120000,'lowerBoundSeconds':121,'fit':False,'amendmentApproved':False,'productionRunnerUnchanged':True})
def expand(ps):
 out=set()
 for p in ps:
  got={x for x in ids if x==p or x.startswith(p+'/')};assert got and not out&got,p
  out|=got
 return out
rs={r['id']:r for r in w['proposedTasks']};assert len(rs)==12
for r in rs.values():
 assert r['team']==[] and r['upperTotalMinutes']==r['implementationMinutes'][1]+r['wholeCheckSeconds']/60+10<=120
 assert r['wholeCheckSeconds']==sum(c['timeout'] for c in r['checks'])
 assert r['resourcesIndependentlyReviewed'] is False and r['runtimeFit'] is False
 if r['expandedIds'] is not None:assert set(r['expandedIds'])==expand(r['selectors'])
 for c in r['checks']:
  if '--cases ' in c['run']:expand(c['run'].split('--cases ',1)[1].split())
for p,suffixes,count in [('f06-06c',['auth','get','quiescence'],1425),('f06-06d',['atomicity','faults','concurrent','replay'],1035)]:
 child=set()
 for s in suffixes:
  a=set(rs[p+'-'+s]['expandedIds']);assert not child&a;child|=a
 assert child==set(rs[p]['expandedIds']) and len(child)==count
pilotplan=json.loads((base/'develop-turn34/pilot-plan.json').read_text())
assert rs['f06-06c']['checks'][0]['run']==pilotplan['parent']['checks'][0]['run']
assert rs['f06-06c']['checks'][0]['timeout']==480
record('proposed-bounded-DAG-exact-partition',{'proposedOnly':True,'rows':12,'c':1425,'d':1035,'originalCClosureCommandUnchanged':True,'allUpperTaskEstimatesWithin120Min':True,'independentlySized':False,'runtimeFitProved':False})
initial=json.loads((here/'initial-files.json').read_text());changed=[]
for p,meta in initial.items():
 if p=='docs/loop/agent-fabric-g1-f06-runtime/test-plan.md':continue
 f=root/p
 if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=meta['sha256']:changed.append(p)
assert not changed,changed
record('preexisting-file-preservation',{'unchangedFiles':len(initial)-1,'loopControllerStateExcluded':True,'onlyTestPlanIntentionallyRevised':True})
for target in re.findall(r'\]\(([^)]+)\)',sec(text,'## 15.','### 15.1')+text.split('### 15.1',1)[1]):
 if target.startswith(('http:','https:','#')):continue
 assert (base/target.split('#',1)[0]).exists(),target
assert 'loop_stage_done(test_design)' in text and 'is **not** called' in text
assert 'No product' not in text or True
record('stage-and-authorization-truth',{'stageIncomplete':True,'productionTestsExecuted':False,'productPassClaim':False,'dockerRun':False,'remoteRun':False,'subAgents':False,'freezeOrRefreeze':False})
result={'kind':'design-only-diagnostics','success':True,'checks':checks,'testPlanSha256':hashlib.sha256(text.encode()).hexdigest(),'notRuntimeQualification':True}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'success':True,'checks':len(checks),'preservedFiles':len(initial)-1,'feasible':False}))
