import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, createBirthChartCache } from '../src/calculator.js';
import { recordText } from '../src/result-view.js';

const positions = {sun:279.95,moon:60.9,mercury:299.35,venus:330.2,mars:20.5,jupiter:95.7,saturn:270.25,ascendant:174+35/60,mc:83+19/60,syzygy:268.2,eleventhCusp:113+11/60+35/3600};
test('five point wrapper retains complete records and adds course syllables',async()=>{
  const result=await calculate({mode:'manual',method:'five',positions,sect:'night'});
  assert.equal(result.name.hebrew,'פעשלהאל');
  assert.equal(result.rootCount,5);assert.equal(result.record.rows.length,5);
  assert.match(result.pronunciation,/Pe.*Ea.*Shi.*La.*He.*El/);
  assert.ok(result.record.formula.includes('福点'));
});
test('all single star routes produce complete display records and selected identity',async()=>{
  for(const method of ['ascendant','moon','angles','eleventh','almuten','luminary']){
    const result=await calculate({mode:'manual',method,positions,sect:'night',options:{origin:'ascendant',selection:'ruler'},selectedPlanet:method==='luminary'?'moon':'mercury'});
    assert.equal(result.rootCount,1,method);
    assert.equal(result.name.letters.length,3,method);
    assert.equal(result.record.headers[2],'取字整数行');
    assert.ok(result.selectedPlanet,method);
    assert.ok(result.record.rows.length);
  }
});
test('eleventh dignity ties retain a full record and correct identity for every name',async()=>{
  const result=await calculate({mode:'manual',method:'eleventh',positions,sect:'night',options:{origin:'ascendant',selection:'dignity',triplicity:'sect'}});
  assert.deepEqual(result.candidates.map(item=>item.selectedPlanet),['moon','jupiter']);
  for(const candidate of result.candidates){assert.equal(candidate.record.rows.length,1);assert.ok(candidate.meta.engine);assert.equal(candidate.rootCount,1);}
});
test('name weighting rows and script are preserved through the UI wrapper',async()=>{
  const result=await calculate({mode:'name',method:'name',nameInput:{text:'ALICE',inputScript:'latin',outputScript:'arabic',suffix:'el'}});
  assert.equal(result.name.script,'ar');assert.equal(result.record.rows.length,5);
  assert.equal(result.rootCount,2);assert.equal(result.record.rows.at(-1).at(-1),'125');
  assert.match(result.record.formula,/125.*31.*94/);
});
test('three-letter suffix length and blocked unselected manual stars remain explicit',async()=>{
  const result=await calculate({mode:'name',method:'name',nameInput:{text:'ALICE',inputScript:'latin',outputScript:'hebrew',suffix:'ayl'}});
  assert.equal(result.rootCount,result.name.letters.length-3);
  await assert.rejects(calculate({mode:'manual',method:'luminary',positions,sect:'night'}),/手动/);
});

test('name method defaults to Hebrew while preserving the optional Arabic script',async()=>{
  const result=await calculate({method:'name',mode:'name',nameInput:{text:'ALICE'}});
  assert.equal(result.name.script,'he');assert.equal(result.name.hebrew,'צדאל');
  assert.match(result.pronunciation,/Tza.*Da.*El/);
});

test('MOSONGRUI keeps its thousand-group explanation in display, copied and exported records',async()=>{
  const result=await calculate({method:'name',mode:'name',nameInput:{text:'MOSONGRUI',inputScript:'arabic'}});
  assert.equal(result.name.hebrew,'ד׳עבאל');
  assert.equal(result.rootCount,3);
  assert.equal(result.nameCalculation.total,4103);
  assert.equal(result.nameCalculation.remainder,4072);
  assert.equal(result.record.rows.at(-1).at(-1),'4103');
  assert.match(result.record.notes.join('\n'),/4.*1000.*70.*2.*4072/);
  assert.ok(result.warnings.some(warning=>warning.includes('千位')));
  const copied=recordText(result);
  assert.match(copied,/ד׳עבאל/);
  assert.match(copied,/4.*1000.*70.*2.*4072/);
  assert.doesNotMatch(copied,/课程|课件|课堂|讲义|本课/);
  assert.doesNotMatch(JSON.stringify(result),/课程|课件|课堂|讲义|本课/);
});

const birth = (changes = {}) => ({
  date:'2000-01-01', time:'12:00:00', latitude:31.2304, longitude:121.4737,
  timezone:'Asia/Shanghai', fold:null, houseSystem:null, ...changes,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const fakeChart = (id, includeSyzygy) => ({
  id, positions:{sun:10,moon:20,mercury:30}, ascendant:40, sect:'day',
  syzygy:includeSyzygy ? 50 : null,
  meta:{engine:'test',flags:[2,2],...(includeSyzygy ? {syzygy_utc:'1999-12-22T00:00:00Z'} : {})},
  warnings:[],
});

test('birth chart cache normalizes nullable fields and passes only astronomical inputs',async()=>{
  const calls=[];
  const cache=createBirthChartCache((payload,options)=>{
    calls.push({payload,options});return fakeChart(calls.length,options.includeSyzygy);
  });
  const first=await cache.get(birth({fold:undefined,houseSystem:undefined,method:'five',place:'上海',selectedPlanet:'sun'}));
  const second=await cache.get(birth({fold:'',houseSystem:'',method:'almuten',place:'任意展示名',selectedPlanet:'moon'}));
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{payload:birth(),options:{includeSyzygy:true}});
  assert.equal(first.id,second.id);
  assert.equal(cache.size,1);
});

test('method, selected star, origin, triplicity and place do not split the astronomical cache',async()=>{
  let count=0;
  const cache=createBirthChartCache((_payload,options)=>fakeChart(++count,options.includeSyzygy));
  for(const changes of [
    {method:'ascendant',place:'城市A'},
    {method:'moon',place:'城市B',options:{origin:'aries'}},
    {method:'angles',selectedPlanet:'jupiter',options:{origin:'ascendant',triplicity:'all'}},
    {method:'almuten',selectedPlanet:'saturn',options:{triplicity:'sect'}},
  ]){
    const chart=await cache.get(birth(changes),{includeSyzygy:false});
    assert.equal(chart.id,1);
  }
  assert.equal(count,1);
});

test('every actual birth field and house system remains independently keyed without coordinate rounding',async()=>{
  let count=0;
  const cache=createBirthChartCache((_payload,options)=>fakeChart(++count,options.includeSyzygy),16);
  await cache.get(birth(),{includeSyzygy:false});
  const differences=[
    {date:'2000-01-02'}, {time:'12:00:01'}, {latitude:31.230400000000003},
    {longitude:121.47370000000001}, {timezone:'Asia/Tokyo'}, {fold:0},
    {fold:1}, {houseSystem:'whole'}, {houseSystem:'placidus'},
  ];
  for(const [index,changes]of differences.entries()){
    const result=await cache.get(birth(changes),{includeSyzygy:false});
    assert.equal(result.id,index+2,JSON.stringify(changes));
  }
  assert.equal(count,differences.length+1);
  assert.equal((await cache.get(birth(),{includeSyzygy:false})).id,1);
});

test('pending identical requests and a light request join one full-chart promise',async()=>{
  const pending=deferred();let count=0;
  const cache=createBirthChartCache(()=>{count++;return pending.promise;});
  const one=cache.get(birth(),{includeSyzygy:true});
  const two=cache.get(birth(),{includeSyzygy:true});
  const light=cache.get(birth(),{includeSyzygy:false});
  assert.equal(cache.size,1);
  await Promise.resolve();assert.equal(count,1);
  pending.resolve(fakeChart(1,true));
  const [a,b,c]=await Promise.all([one,two,light]);
  assert.deepEqual(a,b);assert.deepEqual(a,c);
  assert.notStrictEqual(a,b);assert.notStrictEqual(a.meta,b.meta);
  a.meta.flags.push(99);
  assert.deepEqual(b.meta.flags,[2,2]);
});

test('a completed full chart can satisfy a no-syzygy request without a new entry',async()=>{
  let count=0;
  const cache=createBirthChartCache((_payload,options)=>fakeChart(++count,options.includeSyzygy));
  const full=await cache.get(birth(),{includeSyzygy:true});
  const light=await cache.get(birth(),{includeSyzygy:false});
  assert.equal(count,1);assert.equal(cache.size,1);
  assert.equal(full.id,light.id);assert.equal(light.syzygy,50);
});

test('a no-syzygy chart never satisfies a full chart request',async()=>{
  let count=0;
  const cache=createBirthChartCache((_payload,options)=>fakeChart(++count,options.includeSyzygy));
  const light=await cache.get(birth(),{includeSyzygy:false});
  assert.equal(light.syzygy,null);
  assert.equal(Object.hasOwn(light.meta,'syzygy_utc'),false);
  const full=await cache.get(birth(),{includeSyzygy:true});
  assert.equal(count,2);assert.equal(cache.size,2);
  assert.equal(full.syzygy,50);
  assert.equal((await cache.get(birth(),{includeSyzygy:true})).id,full.id);
  assert.equal(count,2);
});

test('a pending no-syzygy request cannot absorb a full request',async()=>{
  const requests=[];
  const cache=createBirthChartCache((_payload,options)=>{
    const pending=deferred();requests.push({pending,options});return pending.promise;
  });
  const light=cache.get(birth(),{includeSyzygy:false});
  const full=cache.get(birth(),{includeSyzygy:true});
  await Promise.resolve();assert.equal(requests.length,2);
  requests[0].pending.resolve(fakeChart(1,false));
  requests[1].pending.resolve(fakeChart(2,true));
  assert.equal((await light).id,1);assert.equal((await full).id,2);
});

test('cached charts are isolated from callers and from the calculation provider',async()=>{
  const source=fakeChart(1,true);
  const cache=createBirthChartCache(()=>source);
  const first=await cache.get(birth());
  first.positions.sun=999;first.meta.flags[0]=99;first.warnings.push('modified');
  source.positions.sun=888;source.meta.flags.push(88);
  const second=await cache.get(birth());
  assert.equal(second.positions.sun,10);assert.deepEqual(second.meta.flags,[2,2]);
  assert.deepEqual(second.warnings,[]);
  second.meta.flags.push(77);
  assert.deepEqual((await cache.get(birth())).meta.flags,[2,2]);
});

test('birth payload is snapshotted before asynchronous calculation begins',async()=>{
  let seen;
  const cache=createBirthChartCache((payload,options)=>{seen=payload;return fakeChart(1,options.includeSyzygy);});
  const payload=birth();const result=cache.get(payload);
  payload.date='2001-02-03';payload.latitude=80;payload.houseSystem='whole';
  await result;assert.deepEqual(seen,birth());
});

test('failed in-flight entries are evicted for all attached callers and may be retried',async()=>{
  const pending=deferred();let count=0;
  const cache=createBirthChartCache(()=>++count===1?pending.promise:fakeChart(count,true));
  const first=cache.get(birth());const second=cache.get(birth(),{includeSyzygy:false});
  const settled=Promise.allSettled([first,second]);
  await Promise.resolve();assert.equal(count,1);
  pending.reject(new Error('temporary failure'));
  const results=await settled;
  assert.ok(results.every(item=>item.status==='rejected'&&item.reason.message==='temporary failure'));
  assert.equal(cache.size,0);
  assert.equal((await cache.get(birth())).id,2);
  assert.equal(cache.size,1);
});

test('synchronous provider errors also leave no poisoned entry',async()=>{
  let count=0;
  const cache=createBirthChartCache(()=>{count++;throw new Error('sync failure');});
  await assert.rejects(cache.get(birth()),/sync failure/);
  await assert.rejects(cache.get(birth()),/sync failure/);
  assert.equal(cache.size,0);assert.equal(count,2);
});

test('bounded LRU evicts the least recently used entry and includes pending entries',async()=>{
  let count=0;
  const cache=createBirthChartCache((_payload,options)=>fakeChart(++count,options.includeSyzygy),2);
  const a=birth({date:'2000-01-01'}),b=birth({date:'2000-01-02'}),c=birth({date:'2000-01-03'});
  await cache.get(a);await cache.get(b);await cache.get(a);await cache.get(c);
  assert.equal(cache.size,2);assert.equal(count,3);
  assert.equal((await cache.get(a)).id,1);
  await cache.get(b);assert.equal(count,4);assert.equal(cache.size,2);
  const never=deferred();
  const pendingCache=createBirthChartCache(()=>never.promise,2);
  const pending=[pendingCache.get(a),pendingCache.get(b),pendingCache.get(c)];
  assert.equal(pendingCache.size,2);
  never.resolve(fakeChart(1,true));await Promise.all(pending);
  assert.equal(pendingCache.size,2);
});

test('clear removes all entries and an old failed promise cannot delete its replacement',async()=>{
  const requests=[];
  const cache=createBirthChartCache(()=>{const pending=deferred();requests.push(pending);return pending.promise;});
  const old=cache.get(birth());const oldRejected=assert.rejects(old,/old failure/);
  await Promise.resolve();assert.equal(cache.size,1);
  cache.clear();assert.equal(cache.size,0);
  const replacement=cache.get(birth());
  await Promise.resolve();assert.equal(requests.length,2);
  requests[1].resolve(fakeChart(2,true));await replacement;
  requests[0].reject(new Error('old failure'));await oldRejected;
  assert.equal(cache.size,1);assert.equal((await cache.get(birth())).id,2);
  assert.equal(requests.length,2);
});

test('invalid options and invalid numeric types cannot collide with a valid key',async()=>{
  assert.throws(()=>createBirthChartCache(null),/函数/);
  for(const limit of [0,-1,1.5,NaN,Infinity,true])assert.throws(()=>createBirthChartCache(()=>({}),limit),/正整数/);
  let count=0;
  const cache=createBirthChartCache((_payload,options)=>fakeChart(++count,options.includeSyzygy));
  await assert.rejects(cache.get(birth(),{includeSyzygy:'false'}),/布尔值/);
  await assert.rejects(cache.get(null),/出生资料/);
  assert.equal(count,0);
  for(const latitude of [31.2304,'31.2304',null,NaN,Infinity,-Infinity])await cache.get(birth({latitude}));
  assert.equal(count,6);
});
