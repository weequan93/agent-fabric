"""Author design-only workload/partition artifacts. Never launches a product check."""
from pathlib import Path
import json,hashlib,math,copy
here=Path(__file__).resolve().parent;root=here.parents[3];base=here.parent
invpath=root/'g1-runtime/verification/case-inventory.json';inv=json.loads(invpath.read_text());ids=inv['ids'];paths=json.loads((base/'test-design-turn22/case-subsets.json').read_text())['paths']
old=json.loads((base/'test-design-turn36/workload.json').read_text())
pilot={
 'stopped-original-stop-run':['bootId','operationId','originalBindingDigest','snapshotDigest'],
 'stopped-original-stop-task':['bootId','instanceId','resourceId','generation'],
 'lease-expired-original':['bootId','observedAt-stale','observedAt-future'],
 'effect-expired-original':['bootId','descendantsQuiescent','streamsClosed'],
 'stop-and-both-expiries':['bootId','digest','missing','extra-field']}
families=['A16','A18','R18'];groups=list(json.loads((base/'test-design-turn22/case-subsets.json').read_text())['settlementTemplates'])
def expand(prefixes):return [x for x in ids if any(x==p or x.startswith(p+'/') for p in prefixes)]
def suite(i):return inv['families'][i.split('/')[0]]['suite']
recovery=[i for i in ids if suite(i)=='recovery-stop'];continuation=expand(inv['componentViews']['continuation'])
journeys=[]
for i in expand(families):
 path=next((p for p in paths if '/'+p+'/' in i or i.endswith('/'+p)),None)
 if not path:continue
 fields=pilot[path] if i=='A16/quiescence-snapshot/settlement/'+path+'/wrong-boot' else [None]
 for field in fields:
  journeys.append({'caseId':i,'branchId':i+('/pilot-proof/'+field if field else '/required-journey'), 'path':path,'pilotSchemaField':field,'minimumActualExpiryMs':3000 if path in paths[2:] else 0,'independentOriginalRequired':True,'freshOwnerOSProcessRequired':True,'freshRecoveredGETRequired':True,'usefulDistinctSuccessorRequired':True,'fixedCriticalWaitOnlyNotRuntimeUpper':True})
assert len(journeys)==2488 and sum(j['minimumActualExpiryMs'] for j in journeys)==4476000
matrix=expand([f+'/'+g for f in families for g in groups]+[f+'/base' for f in families]);assert len(matrix)==2475
assert {j['caseId'] for j in journeys}==set(matrix)
by_case={i:sum(j['minimumActualExpiryMs'] for j in journeys if j['caseId']==i) for i in matrix}
# A full-journey task stays in one real Node test/child. No test callback is run ahead
# and no completed observation is substituted for another case. Dispatch partitions
# execute actual owning case functions in separately supervised OS processes.
serial=[i for i in recovery if i in {'A12/full','R19/full'}]
functional=[i for i in recovery if i not in serial]
partitions={}
for lanes in [1,4,8,16,32,64]:
 rows=[{'partition':n,'selected':[],'minimumExpiryMs':0} for n in range(lanes)]
 for i in sorted(functional,key=lambda x:(-by_case.get(x,0),x)):
  r=min(rows,key=lambda r:(r['minimumExpiryMs'],len(r['selected']),r['partition']))
  r['selected'].append(i);r['minimumExpiryMs']+=by_case.get(i,0)
 for r in rows:r['selected'].sort(key=recovery.index)
 partitions[str(lanes)]={'logicalSuite':'recovery-stop','exclusivePhase':serial,'functionalPartitions':rows,'fixedCriticalWaitLowerBoundMs':121000+max(r['minimumExpiryMs'] for r in rows),'actualTimingProved':False,'fit':None,'nonWaitCostsMissing':True}
record={'schemaVersion':2,'kind':'test-design-only','feasible':None,'executionReadiness':'NO-GO','productionChanged':False,'officialPlanChanged':False,'stageComplete':False,'findings':{'PR-F06-08':'open','PR-F06-09':'open'},
 'authorization':{'questionId':'q-149465cbcd','answer':'Approve only the recovery-stop 300s inner ceiling; retain all outer limits','approved':True,'suite':'recovery-stop','fromMs':120000,'toMs':300000,'sourceApplied':False,'otherSuiteDeadlinesUnchanged':True,'outerCeilingsUnchanged':True,'fullMatrixFitClaim':False},
 'inventory':{'path':str(invpath.relative_to(root)),'sha256':hashlib.sha256(invpath.read_bytes()).hexdigest(),'ids':len(ids),'local':sum(inv['families'][i.split('/')[0]]['domain']=='L' for i in ids),'recovery':len(recovery),'continuation':len(continuation),'continuationIncludesR19':True,'continuationOtherSuites':{s:[i for i in continuation if suite(i)==s] for s in ['authority-intent','egress']}},
 'serialSamples':{'stopTrials':30,'stopOfferWindowMs':3000,'stopMinimumMs':90000,'actualElapsedExpiryMs':[1000,30000],'combinedMinimumMs':121000,'overlapPermitted':False,'measurementCases':serial,'warmCase':'R20/full','warmSuiteDeadlineMs':120000,'warmIncludedInContinuation':False,'warmSamples':100,'coldMinimumSamples':3,'raceClassTrials':80,'raceKindTrialsEach':20,'raceKinds':5,'bootstrapResamples':2000},
 'actualPilot':old['pilot'],'matrix':{'normativeIds':len(matrix),'minimumIndependentJourneys':len(journeys),'pilotAdditionalJourneys':13,'minimumExpiredOriginals':sum(j['minimumActualExpiryMs']>0 for j in journeys),'serialFunctionalExpiryLowerBoundMs':sum(j['minimumActualExpiryMs'] for j in journeys),'notUpperBound':True,'journeys':journeys},
 'bounds':{'sourceRecoveryInnerMs':120000,'authorizedRecoveryInnerMs':300000,'allOtherLocalSuiteMs':120000,'continuationOuterMs':300000,'continuationFixedSamplesMinimumMs':121000,'continuationMaximumRemainingForAllOtherWorkMs':179000,'minimumFunctionalParallelismIgnoringAllOtherCosts':math.ceil(4476000/179000),'fullCOuterMs':480000,'fullDOuterMs':480000,'authorityRecoveryOuterMs':480000,'fullLocalTaskMs':900000,'finalRuntimeMs':1800000,'ownersOuterMs':600000,'remoteOuterMs':900000,'turnMs':7200000,'ownerLockMs':2000,'ownerStatementMs':5000},
 'candidatePartitions':partitions,'selectedLaneCount':None,'lowerBoundsAreNotFeasibility':True,'measuredWholeMatrix':False,
 'unavailableDomains':old['unavailableDomains'],
 'remainingToCompleteDesign':['Qualify independent-namespace partition semantics and actual resource/throughput envelope; do not declare a lane count feasible from lower bounds','Finish extra branch accounting for nonmatrix race/cold/clock/fault siblings, not just selected ID counts','Demonstrate a complete current-command schedule within every unchanged outer and authorized inner bound, or request exact further amendment only when measured necessary','Then submit test_design and have plan/resources formally submit/review the bounded DAG before broad implementation']}
# Carry the prior exact task command/coverage partitions; add two independently
# bounded infrastructure prerequisites rather than hiding them in feature leaves.
tasks=copy.deepcopy(old['proposedTasks']); pilotcommand=tasks[0]['checks'][0]['run'];covers=json.loads((base/'develop-turn34/pilot-plan.json').read_text())['parent']['covers']
runner={'id':'f06-06c-runner','role':'tester','team':[],'depends_on':['f06-06c-pilot'],'selectors':['H01','H04','H15'],'expandedIds':expand(['H01','H04','H15']),
 'checks':[{'run':'node g1-runtime/scripts/check-suites.mjs harness-integrity --cases H01 H04 H15','timeout':300}],
 'implementationMinutes':[35,65],'wholeCheckSeconds':300,'cleanupEvidenceHandoffMinutes':10,'upperTotalMinutes':80,'status':'proposed-not-submitted','resourcesIndependentlyReviewed':False,'runtimeFit':False,
 'detail':'Implement exact disjoint child-partition union and inherited absolute suite deadline; apply ONLY approved recovery-stop300s override. Keep all other suite120s, full inventories/raw/TAP and outer gates. Exercise actual short-limit disposable supervisor timeout, missing/duplicate/cross-suite/late-failure/cancel/cleanup specimens under owning H cases.'}
fixtures={'id':'f06-06c-fixtures','role':'tester','team':[],'depends_on':['f06-06c-runner'],'selectors':tasks[0]['selectors'],'expandedIds':tasks[0]['expandedIds'],'checks':[{'run':pilotcommand,'timeout':480}],
 'implementationMinutes':[45,80],'wholeCheckSeconds':480,'cleanupEvidenceHandoffMinutes':10,'upperTotalMinutes':98,'status':'proposed-not-submitted','resourcesIndependentlyReviewed':False,'runtimeFit':False,
 'detail':'Prove concurrently running independent fixture universes cannot share targets, mutable config, credentials, ledger, process ownership or success records. Preserve every original/pilot18 journeys and actual3s expiries; add crossed-nonce fault/cancel/isolation positive controls. No product single-VM concurrency claim.'}
tasks[0]['depends_on']=['f06-06c-fixtures'];tasks[0]['detail']='Measure real partition composition primitive, per-case causal phase/resource costs and exact actual branch ledger. Existing five-leaf pilot gate remains limited; it cannot certify full1425/2488 throughput. Keep NO-GO until complete schedule evidenced; no assumption of linear speedup.'
for t in [runner,fixtures]+tasks:
 t['covers']=covers;t['runtimeFit']=False
record['proposedTasks']=[runner,fixtures]+tasks
assert len(record['proposedTasks'])==14
(here/'workload.json').write_text(json.dumps(record,indent=2)+'\n')
(here/'partition-manifest.json').write_text(json.dumps({'kind':'unimplemented-candidate-design','sourceInventorySha256':record['inventory']['sha256'],'caseUniverse':recovery,'serialCases':serial,'candidates':partitions,'selectedLaneCount':None,'runtimeFitClaim':False},indent=2)+'\n')
(here/'proposed-task-payload.json').write_text(json.dumps({'final':False,'proposedOnly':True,'officialPlanChanged':False,'tasks':record['proposedTasks']},indent=2)+'\n')
print(json.dumps({'ids':len(ids),'matrixIds':len(matrix),'minimumJourneys':len(journeys),'functionalExpirySeconds':4476,'minimumParallelismIgnoringOtherCosts':26,'candidateFixedWaitSeconds':{k:v['fixedCriticalWaitLowerBoundMs']/1000 for k,v in partitions.items()},'proposedTasks':14,'runtimeFit':None}))
