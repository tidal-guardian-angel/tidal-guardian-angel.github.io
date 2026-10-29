import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('all authored page, result and error copy avoids learning-material labels',async()=>{
  const root=new URL('../',import.meta.url);
  const sourceFiles=(await readdir(new URL('src/',root))).filter(name=>name.endsWith('.js'));
  const files=['index.html','README.md',...sourceFiles.map(name=>'src/'+name)];
  for(const file of files){
    const content=await readFile(new URL(file,root),'utf8');
    assert.doesNotMatch(content,/课程|课件|课堂|讲义|本课/,file);
  }
});
