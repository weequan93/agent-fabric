import json,hashlib,pathlib,sys
root=pathlib.Path.cwd(); here=root/'docs/loop/agent-fabric-g1-f05-storage/develop-turn96'; goal=root/'.loop/goals/agent-fabric-g1-f05-storage'
def h(b):return 'sha256:'+hashlib.sha256(b).hexdigest()
def bind(p,controller=None):
 b=(root/p).read_bytes();x={'path':p,'bytes':len(b),'sha256':h(b)}
 if controller:x['controllerPath']=controller
 return x
state=json.loads((goal/'state.json').read_text());events=[json.loads(l) for l in (goal/'events.jsonl').read_text().splitlines()]
def run(jobid,checkid):
 job=state['jobs'][jobid];assert job['status']=='finished';start=next(e for e in events if e['type']=='job.started' and e['data']['job']==jobid);end=next(e for e in events if e['type']=='job.finished' and e['data']['job']==jobid);check=next(e for e in events if start['seq']<e['seq']<end['seq'] and e['type']=='check.result' and e['data']['check']==checkid)
 streams={}
 for name in ['stdout','stderr']:
  src=f'.loop/goals/agent-fabric-g1-f05-storage/runs/checks/{jobid}/{checkid}/{name}.log'; dst=f'docs/loop/agent-fabric-g1-f05-storage/develop-turn96/raw/{jobid}/{checkid}/{name}.log';out=root/dst;out.parent.mkdir(parents=True,exist_ok=True);b=(root/src).read_bytes()
  if out.exists():assert out.read_bytes()==b
  else:out.write_bytes(b)
  streams[name]=bind(dst,src)
 stdout=(root/streams['stdout']['path']).read_text();measurements=[]
 for line in stdout.splitlines():
  if line.startswith('# '):line=line[2:]
  if line.startswith('{'):
   try:measurements.append(json.loads(line))
   except json.JSONDecodeError:pass
 metadata=state['checks'].get(checkid)
 if metadata and jobid not in metadata.get('log',''):metadata=None
 old=here/f'local/metadata-{jobid}.json'
 if metadata is None and old.exists():metadata=json.loads(old.read_text())
 return dict(job=job,checkId=checkid,startedEvent=start,checkEvent=check,finishedEvent=end,metadata=metadata,streams=streams,candidate=next((m for m in measurements if m.get('measurement')=='storage-candidate'),None),report=next((m for m in measurements if m.get('measurement')=='storage-test-report'),None),measurements=measurements)
if len(sys.argv)>1:
 assert len(sys.argv)==3 and sys.argv[1]=='--final'
 job=sys.argv[2];task=next(t for t in state['tasks'] if t['id']=='f05-11-races');assert task['status']=='done'
 final=dict(schemaVersion=1,indexDigest=h((here/'index.json').read_bytes()),task=task,tasksDone=sum(t['status']=='done' for t in state['tasks']),tasksTotal=len(state['tasks']),run=run(job,'f05-11-races.verify-lifecycle-races-component'),recoveryRuns=[dict(**run(job,'f05-11-races.recover-owned-timeout-fixture'),timedOutJob='job-63f2f35c95'),dict(**run(job,'f05-11-races.recover-owned-timeout-fixture-2'),timedOutJob='job-a518ff4841')])
 (here/'final-submission.json').write_text(json.dumps(final,indent=2)+'\n')
 print(json.dumps({'final':job,'task':task['status'],'tasksDone':final['tasksDone'],'tasksTotal':final['tasksTotal']}));sys.exit()
changed=['scripts/manifest.mjs','verification/schedule-sources.json','src/schema.ts','tests/lifecycle-propagation.test.ts','scripts/maintenance-verification-registration.mjs','scripts/propagation-verification-registration.mjs','scripts/lifecycle-verification-registration.mjs','scripts/volume-verification-registration.mjs','scripts/artifact-verification-registration.mjs']
old=json.loads((here/'predecessor.json').read_text());new=[str(p.relative_to(root/'g1-storage')) for p in (root/'g1-storage').rglob('*') if p.is_file() and not any(x in ['node_modules','.git'] for x in p.parts) and str(p.relative_to(root/'g1-storage')) not in old]
protected=['scripts/build.mjs','scripts/check-component.mjs','scripts/process-result.mjs','scripts/observation-gate.mjs','scripts/fixture.mjs','scripts/recovery/ownership.mjs','verification/test-design-v1.json','verification/required-variants-v1.json','tests/helpers/propagation-verification-fixture.ts']
sources=[bind('g1-storage/'+p) for p in sorted(set(changed+new+protected)) if (root/'g1-storage'/p).exists()]
sources += [bind(str((here/p).relative_to(root))) for p in ['local/recover-job-63f2f35c95.mjs','local/recover-job-a518ff4841.mjs','validate.mjs','collect.py']]
design=json.loads((root/'g1-storage/verification/test-design-v1.json').read_text());required=json.loads((root/'g1-storage/verification/required-variants-v1.json').read_text())['cases']
checkid='f05-11-races.verify-lifecycle-races-component'; current='job-e283b64e15'
index=dict(schemaVersion=1,turn=96,task='f05-11-races',currentDiagnosticJob=current,sources=sources,predecessors=[],predecessorInventory=bind(str((here/'predecessor.json').relative_to(root))),cases={c:dict(design=design['cases'][c],requiredVariants=required[c],requirements=[r for r,cases in design['requirements'].items() if c in cases]) for c in ['L03','L07']},runs=[run(j,checkid) for j in ['job-d8de7059bb','job-63f2f35c95','job-1deee660d0','job-a518ff4841','job-a51c8050cc','job-6912045861',current]],recoveryRuns=[dict(**run('job-78f6be6069','f05-11-races.recover-owned-timeout-fixture'),timedOutJob='job-63f2f35c95'),dict(**run('job-6a9ae6c1c9','f05-11-races.recover-owned-timeout-fixture-2'),timedOutJob='job-a518ff4841')],failedRecoveryRuns=[dict(**run('job-d453fddd74','f05-11-races.recover-owned-timeout-fixture-2'),timedOutJob='job-a518ff4841')],fullSuiteQualification='pending; bounded fixed component only, full S-L and aggregate controller acceptance not qualified',externalQualification='X01-X09 pending: real KMS/object store/volume/key rotation, replication/power/host/region failures, physical and external erasure/legal holds, real SSO/JML/service identity/provider/region/billing, remote isolation/physical clients')
(here/'index.json').write_text(json.dumps(index,indent=2)+'\n')
print(json.dumps({'index':str(here/'index.json'),'newPackageFiles':len(new),'sources':len(sources),'runs':[(r['job']['id'],r['checkEvent']['data']['status']) for r in index['runs']]}))
