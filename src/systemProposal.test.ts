import {it,expect} from 'vitest';
import {parseProposal,applyProposal} from './systemProposal';
import {normalizeState} from './workflow';
import {createSeed} from './seed';
const raw={title:'검토 업무',description:'변경 검토',tasks:[{name:'영향 검토',short:'IMPACT',mode:'manual',assistant:'',checklist:['범위 확인']}]};
it('validates a proposed task and rejects invalid/empty checklists',()=>{
  expect(parseProposal(JSON.stringify(raw)).tasks[0].checklist).toEqual(['범위 확인']);
  expect(()=>parseProposal(JSON.stringify({...raw,tasks:[{...raw.tasks[0],checklist:[]}]}))).toThrow();
  expect(()=>parseProposal('{"title":"x","tasks":[]}')).toThrow();
});
it('applies an independently composed template and work without losing existing records',()=>{
  const s=normalizeState(createSeed()),p=parseProposal(JSON.stringify(raw));
  const next=applyProposal(s,p,'work');
  expect(next.works).toHaveLength(s.works.length+1);expect(next.works[1]).toEqual(s.works[0]);
  expect(next.works[0].stages[0].checklist[0].label).toBe('범위 확인');
  expect(next.works[0].stages[0].mode).toBe('manual');
});
it('adds a task to a completed work and opens only the new task',()=>{
  const s=normalizeState(createSeed());s.works[0].stages.forEach(t=>t.status='done');
  const next=applyProposal(s,parseProposal(JSON.stringify(raw)),'task',s.works[0].id);
  expect(next.works[0].stages.filter(t=>t.status==='active')).toHaveLength(1);
  expect(next.works[0].stages.at(-1)?.status).toBe('active');
  expect(next.works[0].stages[0].messages).toEqual(s.works[0].stages[0].messages);
});
