/** Shared aggregate/component/slice gate, also used by nonrecursive H04 probes.
 * A sole structured F-O observation supplements executed cases, never replaces them.
 */
export function validateObservations(stdout,id,required,schema,sources=null){
 if(sources){
  const records=stdout.split(/\r?\n/).filter(line=>line.startsWith('# {')).map(line=>JSON.parse(line.slice(2)))
   .filter(value=>['storage-observations','artifact-verification-observations'].includes(value.measurement));
  if(records.length!==sources.length)throw new Error('Every original observation exactly once required: '+id);
  return records.map((raw,index)=>{
   const expected=sources[index];
   if(raw.measurement!==expected.measurement||raw.suite!==expected.suite)throw new Error('Original observation order/identity mismatch: '+id);
   if(raw.measurement!=='storage-observations'&&JSON.stringify(Object.keys(raw))!==JSON.stringify(['measurement','suite','positives','violations']))throw new Error('Closed legacy observation required');
   const value=schema.parse(raw.measurement==='storage-observations'?raw:{schemaVersion:1,measurement:'storage-observations',suite:raw.suite,positives:raw.positives,violations:raw.violations});
   if(Object.values(value.violations).some(n=>n!==0)||expected.positives.some(name=>value.positives[name]<1))throw new Error('Original useful-positive/zero-violation gate failed: '+id);
   return value;
  });
 }
 if(required===null)return null; // contracts have no product behavior to count
 const records=stdout.split(/\r?\n/).filter(line=>line.startsWith('# {"schemaVersion":1,"measurement":"storage-observations"'));
 if(records.length!==1)throw new Error('Exactly one actual observation record required: '+id);
 const value=schema.parse(JSON.parse(records[0].slice(2)));
 if(value.suite!==id||Object.values(value.violations).some(n=>n!==0)
  ||required.some(name=>!Object.hasOwn(value.positives,name)||value.positives[name]<1))throw new Error('Useful positive/zero-violation qualification gate failed: '+id);
 return value;
}
