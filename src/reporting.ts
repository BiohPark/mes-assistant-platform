import type {AppState,Work} from './types';
import {currentStage,getProgress} from './domain';
import {moduleKey} from './workflow';
export function reportScope(state:AppState,start:Date,end:Date,person:string,flow:string){
  const inPeriod=(at:string)=>new Date(at)>=start&&new Date(at)<=end;
  const events=state.events.filter(e=>inPeriod(e.timestamp)&&(person==='전체 담당자'||e.actor===person)&&(flow==='전체 워크플로우'||state.works.find(w=>w.id===e.workId)?.template===flow));
  const workIds=new Set(events.map(e=>e.workId));
  const works=state.works.filter(w=>(flow==='전체 워크플로우'||w.template===flow)&&(workIds.has(w.id)||((person==='전체 담당자'||w.owner===person)&&inPeriod(w.createdAt))));
  return {events,works};
}
export function reportStageGroups(works:Work[]){
  const groups=new Map<string,{id:string;short:string;count:number;manual:boolean}>();
  for(const w of works.filter(w=>getProgress(w)<100)){
    const t=currentStage(w),id=moduleKey(t),existing=groups.get(id);
    if(existing){existing.count++;existing.manual&&=t.mode==='manual';}
    else groups.set(id,{id,short:t.short,count:1,manual:t.mode==='manual'});
  }
  return [...groups.values()];
}
