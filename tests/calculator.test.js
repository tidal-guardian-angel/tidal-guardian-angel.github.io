import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/calculator.js';
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
