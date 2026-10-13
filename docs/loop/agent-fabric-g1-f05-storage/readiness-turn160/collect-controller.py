from pathlib import Path
import json,hashlib
root=Path.cwd(); here=root/'docs/loop/agent-fabric-g1-f05-storage/readiness-turn160'
def bind(p):
 raw=(root/p).read_bytes();return {'path':str(p),'bytes':len(raw),'sha256':'sha256:'+hashlib.sha256(raw).hexdigest()}
state=json.loads((root/'.loop/goals/agent-fabric-g1-f05-storage/state.json').read_bytes())
result=[]
for job_id in ['job-32327b0a0b']:
 job=state['jobs'][job_id];assert job['status']=='finished'
 for check,status in job['results'].items():
  metadata=state['checks'][check];assert status=='pass' and job_id in metadata['log']
  assert metadata['status']=='pass' and metadata['exit_code']==0
  streams=[]
  for channel in ['stdout','stderr']:
   original=Path(metadata['log'])/(channel+'.log');raw=(root/original).read_bytes()
   target=here/'controller'/job_id/check/(channel+'.log');target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(raw);assert target.read_bytes()==raw
   streams.append({'original':bind(original),'copy':bind(target.relative_to(root))})
  result.append({'job':job_id,'check':check,'definition':next(c for t in state['tasks'] if check.startswith(t['id']+'.') for c in t['checks'] if check==t['id']+'.'+c['id']),'result':metadata,'streams':streams,'qualification':'resource availability / original historical failure admission only'})
(here/'controller-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps([{'job':r['job'],'check':r['check'],'status':r['result']['status'],'durationMs':r['result']['duration_ms'],'cleanup':r['result'].get('cleanup'),'workspaceChanged':r['result'].get('workspace_changed'),'bytes':[s['copy']['bytes'] for s in r['streams']]} for r in result]))
