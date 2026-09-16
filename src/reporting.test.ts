import {it,expect} from 'vitest';
import {createSeed} from './seed';
import {reportScope,reportStageGroups} from './reporting';
it('includes a participant activity on work owned by someone else',()=>{
  const s=createSeed(),w=s.works[0];w.owner='Owner';s.events=[{id:'1',workId:w.id,stageId:w.stages[0].id,actor:'Reviewer',timestamp:'2026-09-16T01:00:00Z',action:'팀 의견',detail:'review'}];
  const r=reportScope(s,new Date('2026-09-16T00:00:00Z'),new Date('2026-09-16T23:59:59Z'),'Reviewer','전체 워크플로우');
  expect(r.works.map(w=>w.id)).toContain(w.id);expect(r.events).toHaveLength(1);
});
it('groups custom tasks by module identity and actual manual mode',()=>{
  const w=createSeed().works[0];w.stages.forEach(t=>t.status='pending');w.stages[0]={...w.stages[0],status:'active',moduleId:'custom',short:'CUSTOM',mode:'manual'};
  expect(reportStageGroups([w])).toEqual([{id:'custom',short:'CUSTOM',count:1,manual:true}]);
});
