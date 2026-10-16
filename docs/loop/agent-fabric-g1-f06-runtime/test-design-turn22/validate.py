"""Read-only design diagnostics, not product tests, SQL or check qualification."""
from pathlib import Path
import hashlib,json,re,shlex,sys
here=Path(__file__).resolve().parent; root=here.parents[3]
plan=here.parent/'test-plan.md'; content=plan.read_text(); previous=(here/'test-plan-before.md').read_text()
out=Path(sys.argv[1]).resolve(); assert not out.exists(), 'Do not overwrite retained observations'
sha=lambda b:hashlib.sha256(b).hexdigest()
records=[]
def record(name,value): records.append({'name':name,'observation':value})
def section(text,start,end):return text.split(start,1)[1].split(end,1)[0]
state=json.loads((root/'.loop/goals/agent-fabric-g1-f06-runtime/state.json').read_text())
req=json.loads((here/'requirements-snapshot.json').read_text())
assert req==state['requirements'] and len(req)==101
rows=[l for l in content.splitlines() if re.match(r'^\| [AIQB]\d{2} / (?:AF|UX)-|^\| R\d{2} / R-',l)]
mapped=[re.search(r' / ([A-Z]+-\d+(?:\.\d+)?) ',l).group(1) for l in rows]
assert len(mapped)==len(set(mapped))==101 and set(mapped)=={r['id'] for r in req}
suites={'contracts','authority-intent','tool-paths','egress','lease-queue','browser-refusal','recovery-stop','qualification-matrix','harness-integrity'}
levels={'unit','integration','e2e','performance','security'}
for row in rows:
 cells=[s.strip() for s in row.strip('|').split('|')]; assert len(cells)==5 and all(cells)
 a=[s.strip() for s in cells[1].split(';')];assert a[0] in suites and a[1] in levels
record('finalized-101-requirements',{'exactIds':mapped,'allHaveSuiteLevelDataStepsOracle':True})
family_re=r'^\| ([AIQBRCEHPX]\d{2})(?=\s)'
families={re.match(family_re,l).group(1):l for l in content.splitlines() if re.match(family_re,l)}
assert len(families)==len(re.findall(family_re,content,re.M))==142
expected={f'{p}{n:02}' for p,a,b in [('A',0,27),('I',0,9),('Q',0,17),('B',0,12),('R',1,32),('C',1,6),('E',1,4),('H',1,16),('P',1,5),('X',1,10)] for n in range(a,b+1)}
assert set(families)==expected
for l in families.values():assert any(v in l for v in levels)
children=re.findall(r'^\| (P\d{2}/[a-z-]+);',content,re.M)
assert len(children)==len(set(children))==29
assert [sum(c.startswith(f'P{i:02}/') for c in children) for i in range(1,6)]==[3,10,2,12,2]
record('retained-case-inventory',{'families':142,'local':127,'suites':sorted(suites),'ownerChildren':children})
# Retain all primary semantic rows except explicitly revised legal contract/phase rows.
changed={'C05','C06'}
old_families={re.match(family_re,l).group(1):l for l in previous.splitlines() if re.match(family_re,l)}
for k,l in old_families.items():
 if k not in changed:assert families[k]==l,k
for line in previous.splitlines():
 m=re.match(r'^\| (P\d{2}/[a-z-]+);',line)
 if m and m[1]!='P02/barrier-first':assert line in content,m[1]
for a,b in [('## 11.','## 12.'),('## 12.','## 13.'),('### 10.3','### 10.4')]:assert section(previous,a,b)==section(content,a,b),a
record('preserved-prior-oracles',{'unchangedFamilyRows':140,'unchangedOwnerChildRows':28,'measurementProtocolUnchanged':True,'qualificationRulesUnchanged':True,'fullP04RowsUnchanged':True})
contracts=re.findall(r'^\| `(CONTRACT/[a-z-]+)` / (C\d{2}) / ([a-z]+) \|',content,re.M)
assert len(contracts)==8
assert {n for n,_,_ in contracts}=={'CONTRACT/'+s for s in ['authority-provenance','pins','matrix','qualification','queue','effect','settlement','fence-composition']}
record('eight-named-contracts',contracts)
leaf=json.loads((here.parent/'solution-turn21/leaf-plan-contract.json').read_text())
design=json.loads((here/'case-subsets.json').read_text())
phase=json.loads((here.parent/'solution-turn21/phase-contract.json').read_text())
assert design['phaseVariants']==phase['variants'] and len(phase['variants'])==6
assert design['paths']==leaf['paths'] and len(design['paths'])==5
assert design['groups']==leaf['groups'] and len(design['groups'])==7
# Check exact53 proposed leaf commands and dependency edges, not old15 prose checkpoints.
task_rows=re.findall(r'^\| (f06-[0-9a-z]+) \| (.*?) \| (.*?) \| (.*?) \|$',content,re.M)
assert len(task_rows)==53
assert [r[0] for r in task_rows]==[t['id'] for t in leaf['tasks']]
for (tid,deps,output,checks),t in zip(task_rows,leaf['tasks']):
 assert tid==t['id'] and deps==(', '.join(t['depends_on']) or 'none') and output==t['output']
 assert re.findall(r'`([^`]+)`',checks)==t['checks'],tid
 assert t['implementationMinutes'][1]+t['checkSeconds']/60+t['handoffMinutes']<=120,tid
record('53-separate-leaf-contracts',{'exactMirror':True,'count':53,'proposedNotSubmitted':True,'allUpperEstimatesWithin120Minutes':True,'resourcesMustReassess':True})
# Build a text-only closed registry from the specified family/child/variant templates.
# This checks unambiguous specification, never substitutes for product registry/tests.
nodes=set()
def add(node):
 assert node not in nodes,node
 nodes.add(node)
def replace(prefix,values):
 for n in list(nodes):
  if n==prefix or n.startswith(prefix+'/'):nodes.remove(n)
 for suffix in values:add(prefix+'/'+suffix)
for family in families:
 if family.startswith('P'):continue
 add(family+'/full')
for child in children:add(child+'/full')
for parent,parts in {**design['earlyPartitions'],**design['additionalLocalPartitions']}.items():replace(parent,list(parts))
replace('P02/phase-first/pre-transfer',['claim-key-first','transfer-barrier-first'])
replace('P02/unchanged-callers/native-stop',design['nativeStopVariants'])
replace('P02/unchanged-callers/remaining-owner-races',design['remainingOwnerRaces'])
replace('P02/barrier-first',[v['id'] for v in phase['variants']])
replace('P02/barrier-first/live-reconcile-confirm-before-stop',['receipt-acked','send-ack-lost'])
replace('P02/transfer-atomic',[])
for group,parts in design['settlementTemplates'].items():
 for part,variants in parts.items():
  assert len(variants)==len(set(variants)) and variants,(group,part)
  for path in design['paths']:
   for variant in variants:add(f'P02/transfer-atomic/{group}/{part}/{path}/{variant}')
for path in design['paths']:
 for variant in design['transferFinalization']:add(f'P02/transfer-atomic/finalization/{path}/{variant}')
for family,remaining in design['localRecoveryRemaining'].items():
 replace(family,remaining)
 for path in design['paths']:add(f'{family}/base/{path}')
 for group,parts in design['settlementTemplates'].items():
  for part,variants in parts.items():
   for path in design['paths']:
    for variant in variants:add(f'{family}/{group}/{part}/{path}/{variant}')
for family in ['X04','X09']:
 replace(family,['base' if family=='X04' else 'watchdog-lease-timing-outage'])
 for path in design['paths']:
  for group,parts in design['settlementTemplates'].items():
   for part,variants in parts.items():
    for variant in variants:add(f'{family}/settlement/{path}/{group}/{part}/{variant}')
  for variant in design['transferFinalization']:add(f'{family}/settlement/{path}/finalization/{variant}')
def expand(prefix):
 found={n for n in nodes if n==prefix or n.startswith(prefix+'/')}
 assert found,'Unknown selector '+prefix
 return found
# Suite views always include whole original families; component views are explicit.
family_suites={}
for f,line in families.items():
 if f.startswith('P'):family_suites[f]='owner-integration'
 elif f.startswith('X'):family_suites[f]=line.split('|')[2].strip().split(';')[0]
 else:
  body=line.split('|')[2].strip()
  family_suites[f]=next(s for s in suites if re.match(re.escape(s)+r';',body))
views={s:set() for s in suites}
for f,s in family_suites.items():
 if s in views:views[s]|=expand(f)
components={c:set().union(*(expand(p) for p in ps)) for c,ps in design['componentViews'].items()}
expansions=[]
for t in leaf['tasks']:
 for command in t['checks']:
  args=shlex.split(command); script=args[1]; selectors=args[args.index('--cases')+1:] if '--cases' in args else None
  if script.endswith('check-component.mjs'):
   assert args[2] in components; permitted=components[args[2]]
  elif script.endswith('check-suites.mjs'):
   selected=args[2:args.index('--cases')] if selectors is not None else args[2:]
   assert selected and set(selected)<=suites
   permitted=set().union(*(views[s] for s in selected))
  elif script.endswith('check-owners.mjs'):permitted={n for n in nodes if n.startswith('P')}
  elif script.endswith('check-remote.mjs'):permitted={n for n in nodes if n.startswith('X')}
  elif script=='g1-runtime/scripts/check.mjs':permitted={n for n in nodes if not n.startswith(('P','X'))}
  else:continue # unchanged external regression command, not a case selector.
  chosen=set()
  if selectors is None:chosen=permitted.copy()
  else:
   assert selectors
   for selector in selectors:
    e=expand(selector); assert e<=permitted,(t['id'],selector,'wrong component/suite')
    assert not e&chosen,(t['id'],'overlapping selection')
    chosen|=e
  expansions.append({'task':t['id'],'command':command,'selectedPrefixes':selectors,'expandedAssertionNodes':len(chosen),'unexecutedInRunner':len(permitted-chosen),'fullRunnerInventory':selectors is None,'assurance':'design-only'})
assert any(e['task']=='f06-09j' and e['selectedPrefixes']==['P01','P02'] for e in expansions)
assert any(e['task']=='f06-11e' and e['command']=='node g1-runtime/scripts/check-owners.mjs' for e in expansions)
assert any(e['task']=='f06-14e' and e['command']=='node g1-runtime/scripts/check-remote.mjs' for e in expansions)
record('closed-nested-selector-resolution',{'designAssertionNodes':len(nodes),'notExecutedTestCount':True,'allLeafCommandsResolved':True,'expandedSelections':expansions})
# Every new P transfer assertion is covered by c-g or h; all deferred assertions explicit.
def task_nodes(tid):
 result=set()
 for e in expansions:
  if e['task']!=tid:continue
  if e['selectedPrefixes']:
   for prefix in e['selectedPrefixes']:result|=expand(prefix)
 return result
partial=set().union(*(task_nodes('f06-09'+c) for c in 'cdefg'))
full=expand('P02/transfer-atomic'); deferred=full-partial
assert deferred and deferred<=task_nodes('f06-09h')
assert all('/finalization/' in n or '/rollback-commit-recovery/transfer/' in n or '/old-worker-replay-denied/post-transfer/' in n for n in deferred)
for path in design['paths']:
 for group in design['groups']:
  assert any('/'+group+'/' in n and '/'+path+'/' in n for n in full)
assert not any('/finalization/' in n for n in partial)
record('settlement-versus-transfer-ownership',{'fullPTransferAssertionNodes':len(full),'cThroughG':len(full&partial),'deferredToH':len(deferred),'allFivePathsSevenGroups':True,'noPrematureSuccessor':True})
for parent,parts in design['earlyPartitions'].items():
 full=expand(parent)
 for part in parts:
  subset=expand(parent+'/'+part)
  assert subset<full,(parent,part)
# Negative design mutations are checked against this same closed text registry.
def selection_ok(prefixes,permitted):
 try:
  selected=set()
  if not prefixes:return False
  for p in prefixes:
   expanded=expand(p)
   if not expanded<=permitted or expanded&selected:return False
   selected|=expanded
  return True
 except AssertionError:return False
p_nodes={n for n in nodes if n.startswith('P')}
mutations={'unknown':['P02/not-registered'],'duplicate':['P02/phase-first','P02/phase-first'],'overlap':['P02','P02/barrier-first'],'wrong-namespace':['X04'],'empty':[],'unknown-field':['P02/transfer-atomic/fresh-authority/negative/not-a-path/not-a-field']}
for name,selectors in mutations.items():assert not selection_ok(selectors,p_nodes),name
record('negative-selector-specimens',{'rejected':list(mutations),'beforeIORequired':True,'testRegistryNotImplemented':True})
phase_text=section(content,'### 10.2.3','### 10.2.4')
for v in phase['variants']:assert '| `'+v['id']+'` |' in phase_text,v['id']
for token in ['EffectRepository.reconciling','EffectRepository.confirm','guardedIO(false)','UNKNOWN','RECONCILING','ILLEGAL_TRANSITION','STALE_AUTHORITY','same owner instance','independent','separate','acknowledged','fairness','no-send','SEND ACK','claim-COMMIT','useful distinct successor','40P01','55P03','receiptDigest','recovery_effect_events/recovery_receipts/recovery_outbox']:
 assert token in phase_text,token
assert 'C-before-B may confirm with live authority' not in section(content,'### 10.2 P02','### 10.2.1')
record('six-legal-phase-schedules',{'variants':[v['id'] for v in phase['variants']],'separateLiveFencedMisuseExpectedOutcomes':True,'originalTransitionsUnchanged':True})
# Source-read observations corroborate legal flow; do not import/run owners.
effect=(root/'g1-recovery/src/effect-repository.ts').read_text(); transitions=(root/'g1-recovery/src/contracts.ts').read_text()
assert "unknown: ['reconciling']" in transitions and "reconciling: ['confirmed', 'not-applied', 'unknown']" in transitions
for token in ["state:'unknown'","'reconciling'","assertEffectTransition(effect.state,'confirmed')",'dispatchClaims.add','dispatchClaims.delete'] :assert token in effect,token
native=(root/'g1-model/src/native-repository.ts').read_text().split(' async stop(',1)[1]
assert native.index('await this.load(tx,scope,c.sessionId)')<native.index('await lockOriginal(tx,scope,c.key)')<native.index('new FenceRepository(new RecoveryRepository(nested,this.bindingFor)).execute')
record('read-only-original-owner-source',{'effectSha256':sha(effect.encode()),'transitionsSha256':sha(transitions.encode()),'codeExecuted':False})
goal=json.loads((root/'.loop/goals/agent-fabric-g1-f06-runtime/goal.json').read_text())
assert [c['timeout'] for c in goal['acceptance']]==[1800,600,600,900]
assert [c['argv'] for c in goal['acceptance']]==[['node',p] for p in ['g1-runtime/scripts/check.mjs','g1-identity/scripts/check.mjs','g1-foundations/scripts/check.mjs','g1-foundations/scripts/check-retained.mjs']]
for token in ['approved:false','no-Docker','q-a1b6151885','full `node g1-runtime/scripts/check-owners.mjs`','full `node g1-runtime/scripts/check-remote.mjs`','100 recorded authenticated','30 online trials','20 conflicting race trials','no-Docker','120min','pending-external'] :assert token in content,token
record('unchanged-acceptance-and-eligibility',{'acceptanceSeconds':[1800,600,600,900],'remoteApproved':False,'dockerAllowed':False,'actualEligibleChecksRun':False})
assert len(re.findall(r'^```',content,re.M))%2==0
links=[]
for target in re.findall(r'\]\(([^)]+)\)',content):
 if target.startswith(('http','#')):continue
 path=(plan.parent/target.split('#')[0]).resolve(); assert path.exists() or path==out,target
 links.append(target)
record('markdown-links',{'count':len(links),'allExist':True,'balancedFences':True})
before=json.loads((here/'initial-files.json').read_text()); before.pop(str(plan.relative_to(root)))
for path,digest in before.items():assert (root/path).is_file() and sha((root/path).read_bytes())==digest,path
record('preserved-initial-files',{'count':len(before),'allMatch':True,'onlyTestPlanMayDiffer':True})
result={'scope':'Design-only document/JSON/source/hash diagnostics; no product/check/SQL/PG/worker/Docker/GUI/remote/controller-acceptance/review execution','testPlanSha256':sha(plan.read_bytes()),'caseSpecificationSha256':sha((here/'case-subsets.json').read_bytes()),'validatorSha256':sha(Path(__file__).read_bytes()),'records':records}
out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'designDiagnostics':'passed','groups':len(records),'requirements':101,'families':142,'ownerChildren':29,'trackedLeafProposals':53,'designAssertionNodes':len(nodes),'preservedFiles':len(before),'productChecksRun':False,'output':str(out)}))
