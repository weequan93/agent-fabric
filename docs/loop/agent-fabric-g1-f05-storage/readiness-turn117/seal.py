"""Seal only the completed new resource document and evidence, never controller state."""
from capture import ROOT,BASE,PREFIX,write,binding,read
report=str(BASE.parent.relative_to(ROOT))+'/readiness.md'
assert 'Turn117' in (ROOT/report).read_text() and read(PREFIX+'/audit-result.json')['ok']
files=[binding(str(p.relative_to(ROOT))) for p in sorted(BASE.rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.name!='submission-binding.json']
write('submission-binding.json',{'schemaVersion':1,'stage':'resources','readiness':binding(report),'candidate':read(PREFIX+'/audit-result.json')['candidate'],'plan':{'tasks':66,'checks':113,'requirements':96,'done':43,'unfinished':23},'qualification':'Local prerequisites for separate independent plan review; no implementation/product/external acceptance','files':files})
print({'readiness':binding(report),'sealedFiles':len(files)})
