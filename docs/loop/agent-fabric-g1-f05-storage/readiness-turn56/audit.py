"""Read-only resource/task/capacity audit; writes new resource evidence only."""
import datetime, hashlib, json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
def read(p): return json.loads((ROOT/p).read_text())
def digest(p): return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def write(name,data): (HERE/name).write_text(json.dumps(data,indent=2)+'\n')
s=read('.loop/goals/agent-fabric-g1-f05-storage/state.json'); g=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json'); p=read('docs/planning/g1-f05-task-plan-v3.json')
current={t['id']:t for t in s['tasks']}; fields=['title','detail','covers','depends_on','role','team','checks']
assert len(p['tasks'])==len(current)==58 and sum(len(t['checks']) for t in p['tasks'])==84
for t in p['tasks']:
 assert all(t[f]==current[t['id']][f] for f in fields), t['id']
 assert len(t['team'])<=g['agent'].get('team_limit',4) and t['team']==[]
seen=set()
for t in p['tasks']: assert set(t['depends_on'])<=seen; seen.add(t['id'])
assert len(s['requirements'])==96 and {r['id'] for r in s['requirements']}<={r for t in p['tasks'] for r in t['covers']}
old=read('docs/loop/agent-fabric-g1-f05-storage/plan-turn55/controller-tasks-before.json')
for t in old:
 for f in ['status','attempts','started_at','created_at','notes','summary']: assert t.get(f)==current[t['id']].get(f),(t['id'],f)
 for c in t['checks']: assert c in current[t['id']]['checks']
inputs=read(p['currentInputBinding'])
for f in inputs['files']: assert digest(f['path'])==f['sha256'] and (ROOT/f['path']).stat().st_size==f['bytes']
assert inputs['approvedGoalSha256']==digest('.loop/goals/agent-fabric-g1-f05-storage/goal.json') and inputs['approvedDigest']==s['approved_digest'] and inputs['policy']==g['policy'] and inputs['startedAt']==s['started_at']
# Preserve the planning-stage readiness input at a new history path; it is the
# only documented source replacement. The original binding stays untouched.
prior=read('docs/loop/agent-fabric-g1-f05-storage/plan-turn55/review-candidate-binding.json')
for f in prior['files']:
 target='docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/readiness-turn55-preserved.md' if f['path'].endswith('/readiness.md') else f['path']
 assert digest(target)==f['sha256'] and (ROOT/target).stat().st_size==f['bytes'],target
cases=read(p['repairCaseAllocation']); assert sum(map(len,cases['variants'].values()))==24 and sum(x['tests'] for x in cases['predecessors'])==48 and p['requiredVariants']==420
baseline=read('g1-storage/verification/preserved-inputs.json')
for file,h in baseline['files'].items(): assert digest(file)==h,file
changed=[]
for f in read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/before-files.json'):
 if digest(f['path'])!=f['sha256']: changed.append(f['path'])
assert set(changed)<= {'docs/loop/agent-fabric-g1-f05-storage/readiness.md'},changed
for t in read('g1-storage/evidence/f05-05-volume-integration-v1.json')['streams']:
 assert digest(t['path'])==digest(t['controllerPath'])==t['sha256']
 assert (ROOT/t['path']).stat().st_size==(ROOT/t['controllerPath']).stat().st_size==t['bytes']
now=datetime.datetime.now(datetime.timezone.utc); pending=[t for t in s['tasks'] if t['status']!='done']; budget=p['taskBudgetsMinutes']; minutes=sum(budget[t['id']] for t in pending)
assert len(pending)==47 and minutes==3340 and s['iteration']==56 and g['policy']['max_iterations']==120 and g['policy']['max_hours']==144
assert all(0<budget[t['id']]<g['policy']['turn_timeout_minutes'] for t in pending)
future=120-56; pipeline=7; repairs=future-len(pending)-pipeline; elapsed=(now-datetime.datetime.fromisoformat(s['started_at'])).total_seconds()/3600
estimated=elapsed+minutes/60+pipeline*2+repairs*2+3
assert repairs==10 and estimated<144
capacity={'observedAt':now.isoformat(),'iteration':56,'originalStart':s['started_at'],'approvedDigest':s['approved_digest'],'approvedPolicy':g['policy'],'remainingTurns':future,'unfinishedTasks':len(pending),'workMinutes':minutes,'workHours':minutes/60,'pipelineTurns':pipeline,'pipelineStages':['independent plan review','staged-test reporting/preparation','independent security review','independent code review','final acceptance review','product acceptance review','final evidence/handoff'],'repairReserveTurns':repairs,'elapsedWallHours':elapsed,'pipelineHours':pipeline*2,'repairHours':repairs*2,'controllerCheckReserveHours':3,'totalEstimatedWallHours':estimated,'headroomHours':144-estimated,'taskBudgetsMinutes':{t['id']:budget[t['id']] for t in pending},'teamLimit':g['agent'].get('team_limit',4),'maximumDelegatedSeats':0,'accountingReset':False,'estimateNotGuarantee':True}
write('capacity-binding.json',capacity)
assign=[]
for t in p['tasks']:
 commands=[c['run'] for c in t['checks']]; missing=[]
 for c in commands:
  path=c.split()[1] if c.startswith('node ') else None
  if path and not (ROOT/path).is_file(): missing.append(path)
 assign.append({'id':t['id'],'role':t['role'],'team':t['team'],'status':current[t['id']]['status'],'dependsOn':t['depends_on'],'checks':t['checks'],'budgetMinutes':budget.get(t['id']),'missingPlannedEntrypoints':sorted(set(missing)),'resourceProfile':'pinned local Node/PG/encrypted files/HTTP/IdP; controller process census and GUI where required','ownerOfMissingOutputs':t['id']})
write('task-resource-allocation.json',assign)
paths=[x['path'] for x in inputs['files']]+[p['schedule'],p['repairCaseAllocation'],p['capacityBinding'],p['currentInputBinding'],'docs/planning/g1-f05-task-plan-v3.json','docs/loop/agent-fabric-g1-f05-storage/test-plan-v3-repair-supplement.md','docs/loop/agent-fabric-g1-f05-storage/plan-turn55/review-candidate-binding.json','docs/planning/g1-f05-plan.md','docs/evidence/g1-f05-acceptance.md','g1-storage/scripts/build.mjs','g1-storage/package.json','g1-storage/scripts/check.mjs']
write('inputs.json',{'observedAt':now.isoformat(),'files':[{'path':x,'bytes':(ROOT/x).stat().st_size,'sha256':digest(x)} for x in dict.fromkeys(paths)],'approvedGoalSha256':inputs['approvedGoalSha256'],'approvedDigest':s['approved_digest'],'storageSourcesChanged':False,'priorReadinessPath':'docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/readiness-turn55-preserved.md','priorReadinessSha256':digest('docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/readiness-turn55-preserved.md')})
write('audit-result.json',{'observedAt':now.isoformat(),'tasks':58,'checks':84,'requirements':96,'done':11,'unfinished':47,'originalVariants':420,'additionalRepairVariants':24,'exactPredecessorTests':48,'authoredFieldsAndDependenciesMatch':True,'allPriorTaskChecksAndHistoriesRetained':True,'protectedFilesUnchanged':len(baseline['files']),'unchangedPreexistingFiles':975-len(changed),'changedPreexistingFiles':changed,'priorPlanReadinessMappedToByteIdenticalPreservedCopy':True,'legacyFailureStreamsMatchOriginalBytesAndHashes':True,'teamLimit':4,'maximumDelegatedSeats':0,'remainingWorkMinutes':minutes,'noProductOrExternalVerdict':True})
print(json.dumps({'capacity':capacity,'auditedTasks':58,'checks':84,'protectedInputs':len(baseline['files']),'changed':changed},indent=2))
