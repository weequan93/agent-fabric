"""Design-only read/hash diagnostics; never imports or runs product code."""
from pathlib import Path
import hashlib, json, re, sys
root = Path(__file__).resolve().parents[4]
plan = root / 'docs/loop/agent-fabric-g1-f06-runtime/test-plan.md'
content = plan.read_text()
state_path = root / '.loop/goals/agent-fabric-g1-f06-runtime/state.json'
state = json.loads(state_path.read_text())
output = Path(sys.argv[1]).resolve()
assert not output.exists(), 'Preserve earlier diagnostic results'
sha = lambda b: hashlib.sha256(b).hexdigest()
records = []
def record(name, value):
    records.append({'name': name, 'observation': value})
requirements = {r['id'] for r in state['requirements']}
rows = [line for line in content.splitlines() if re.match(r'^\| [AIQB]\d{2} / (?:AF|UX)-|^\| R\d{2} / R-', line)]
mapped = [re.search(r' / ([A-Z]+-\d+(?:\.\d+)?) ', row).group(1) for row in rows]
assert len(mapped) == len(set(mapped)) == 101
assert set(mapped) == requirements
local_suites = {'contracts','authority-intent','tool-paths','egress','lease-queue','browser-refusal','recovery-stop','qualification-matrix','harness-integrity'}
levels = {'unit','integration','e2e','performance','security'}
for row in rows:
    cells = [s.strip() for s in row.strip('|').split('|')]
    assert len(cells) == 5, cells[0]
    attributes = [s.strip() for s in cells[1].split(';')]
    assert attributes[0] in local_suites
    assert attributes[1] in levels
    assert all(cells), cells[0]
record('finalized-requirement-mapping', {'count': len(mapped), 'missing': [], 'extra': [], 'rowFields': 'case/requirement,suite/level/domain,preconditions/data,steps,oracle'})
families = re.findall(r'^\| ([AIQBRCEHPX]\d{2})(?=\s)', content, re.M)
assert len(families) == len(set(families)) == 142, (len(families), len(set(families)))
expected_families = {f'{prefix}{n:02}' for prefix, start, stop in [('A',0,27),('I',0,9),('Q',0,17),('B',0,12),('R',1,32),('C',1,6),('E',1,4),('H',1,16),('P',1,5),('X',1,10)] for n in range(start,stop+1)}
assert set(families) == expected_families
for line in content.splitlines():
    if re.match(r'^\| [AIQBRCEHPX]\d{2}(?=\s)', line):
        assert any(level in line for level in levels), line[:100]
record('family-inventory', {'all': len(families), 'local':127, 'P':5, 'X':10, 'unique':True, 'allFamiliesHaveLevel':True, 'localSuiteCount': len(local_suites)})
children = re.findall(r'^\| (P\d{2}/[a-z-]+);',content,re.M)
expected_children = {
 'P01':['current-authority','worker-db-denial','dispatch-binding'],
 'P02':['queue-atomic','key-collision','cancel-expiry','reopen-slot','wait-current','phase-first','barrier-first','claim-one-use','transfer-atomic','unchanged-callers'],
 'P03':['family-receipts','rollback-unknown'],
 'P04':['save-reopen','version-cas','original-key','restricted-child','parent-current','source-audience','budget-lineage','hook-transaction','staging-failure','publication-rollback','commit-ack-loss','promotion-separation'],
 'P05':['install-compatibility','preserve-rollback']}
expanded = {family+'/'+child for family, members in expected_children.items() for child in members}
assert len(children) == len(set(children)) == 29
assert set(children) == expanded
for child in children:
    row = next(l for l in content.splitlines() if l.startswith('| '+child+';'))
    assert len(row.strip('|').split('|')) == 3 and all(c.strip() for c in row.strip('|').split('|')), child
record('mandatory-owner-children', {'byFamily': {k:len(v) for k,v in expected_children.items()}, 'total':len(children), 'unique':True, 'inheritedSuiteLevelPreconditions':True})
task_rows = re.findall(r'^\| f06-(\d{2}) \| (.+)$',content,re.M)
assert [int(n) for n,_ in task_rows] == list(range(1,16))
owner08 = next(row for n,row in task_rows if n=='08')
selection = re.search(r'--cases ([^`]+)',owner08).group(1).split()
queue_only = ['P02/'+s for s in expected_children['P02'][:5]]+['P05']
assert selection == queue_only
assert len(expected_children['P05'])+len(selection)-1 == 7
for task, ids in [('09',['P01','P02']),('10',['P03']),('11',['P04']),('13',['X01','X04']),('14',['X02','X03','X05','X06','X07','X08','X09','X10'])]:
    row = next(row for n,row in task_rows if n==task)
    actual = re.search(r'--cases ([^`]+)',row).group(1).split()
    assert actual == ids, (task,actual)
assert 'full `node g1-runtime/scripts/check-owners.mjs`' in content
assert 'full `node g1-runtime/scripts/check-remote.mjs`' in content
for token in ['Original four controller acceptance commands','phase-first','barrier-first','pg_blocking_pids','UNKNOWN_COMMIT','readWithTransaction','runtime_admit_plan_maintenance(save_key)','parent_run_id','beforeArtifactPublication','afterArtifactWrite','model12','approved:false','No Docker','2s lock and 5s statement','100 recorded authenticated','30 online trials','20 conflicting race trials']:
    assert token in content, token
record('bounded-checkpoints', {'tasks':15, 'queueOnlySelection':selection, 'expandedQueueOnlyChildren':7, 'fullPAndXRetained':True, 'reviewObligationsAndFixedSamplesPresent':True})
assert len(re.findall(r'^```',content,re.M)) % 2 == 0
links = []
for target in re.findall(r'\]\(([^)]+)\)',content):
    if target.startswith(('http','#')): continue
    local = (plan.parent/target.split('#')[0]).resolve()
    assert local.exists(), target
    links.append(target)
record('markdown', {'localLinks':links,'balancedFences':True})
source_tokens = {
 'g1-storage/src/artifact-publication.ts':["n.binding.intent==='Ask'&&n.binding.purpose==='maintenance'",'async prepare(', 'async commit(', 'async lookup(', 'async readWithTransaction(', 'beforeArtifactPublication', 'afterArtifactWrite'],
 'g1-recovery/src/effect-repository.ts':['dispatchClaims.add','dispatchClaims.delete',"await this.lockPhase(tx,scope,operationId,'dispatch')",'lockSpaceBarrier'],
 'g1-foundations/src/postgres-uow.ts':["SET LOCAL lock_timeout='2s'","SET LOCAL statement_timeout='5s'",'UNKNOWN_COMMIT'],
 'g1-model/migrations/0012_family_budget.sql':['parent_run_id','model_capture_budget_lineage AFTER INSERT']}
source_hashes={}
for path,tokens in source_tokens.items():
    data=(root/path).read_text()
    for token in tokens: assert token in data, (path,token)
    source_hashes[path]=sha((root/path).read_bytes())
record('read-only-installed-owner-seams', source_hashes)
before = json.loads(Path('/private/tmp/af-f06-turn12-initial.json').read_text())
assert all((root/p).is_file() and sha((root/p).read_bytes())==h for p,h in before.items())
record('pre-existing-tracked-work-preserved', {'files':len(before),'sha256':before})
result={'scope':'design-document diagnostics only; no product tests/SQL/worker/Docker/GUI/remote/acceptance/review execution', 'testPlanSha256':sha(plan.read_bytes()), 'requirementsSourceSha256':sha(state_path.read_bytes()), 'validatorSha256':sha(Path(__file__).read_bytes()), 'records':records}
output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'designDiagnostics':'passed','records':len(records),'requirements':101,'families':142,'ownerChildren':29,'path':str(output),'productChecksRun':False}))
