import type {AppState,Mode,TaskModule} from './types';
import {addWork,event,mergeStageStructure,uid} from './domain';
import {instantiateModule} from './workflow';
export type Proposal={title:string;description:string;tasks:{name:string;short:string;mode:Mode;assistant:string;checklist:string[]}[]};
export type ProposalAction='work'|'template'|'task';
export function parseProposal(text:string):Proposal {
  let value:any;
  try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('제안이 JSON 형식이 아닙니다. 다시 제안받아 주세요.');}
  const validText=(s:unknown,max=300):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
  if(!value||!validText(value.title)||!Array.isArray(value.tasks)||value.tasks.length<1||value.tasks.length>20)throw new Error('업무명과 1~20개의 Task가 포함된 제안이 필요합니다.');
  const tasks=value.tasks.map((t:any)=>{
    if(!t||!validText(t.name)||!validText(t.short,30)||!['assistant','manual'].includes(t.mode)||(t.mode==='assistant'&&!validText(t.assistant))||!Array.isArray(t.checklist)||t.checklist.length<1||t.checklist.length>20||!t.checklist.every((c:unknown)=>validText(c,500)))throw new Error('Task의 이름, 진행 방식, assistant, 달성 체크리스트가 올바르지 않습니다.');
    return {name:t.name.trim(),short:t.short.trim(),mode:t.mode as Mode,assistant:t.mode==='manual'?'':t.assistant.trim(),checklist:t.checklist.map((c:string)=>c.trim())};
  });
  return {title:value.title.trim(),description:typeof value.description==='string'?value.description.slice(0,2000):'',tasks};
}
export function applyProposal(state:AppState,proposal:Proposal,action:ProposalAction,workId?:string):AppState{
  // Revalidate the boundary even for an edited or sample proposal.
  const p=parseProposal(JSON.stringify(proposal));
  const modules:TaskModule[]=p.tasks.map(t=>({...t,id:uid(),description:p.description}));
  const stages=modules.map(instantiateModule);
  const next={...state,modules:[...(state.modules||[]),...modules]};
  if(action==='task'){
    const work=state.works.find(w=>w.id===workId);if(!work)throw new Error('Task를 추가할 업무를 선택해 주세요.');
    return {...next,works:state.works.map(w=>w.id===workId?{...w,stages:mergeStageStructure(w,[...w.stages,...stages])}:w),events:[event(state,work.id,'','Assistant Task 추가',p.title),...state.events]};
  }
  const template={id:uid(),name:p.title,description:p.description,stages};
  const withTemplate={...next,templates:[...state.templates,template],events:[event(state,'','','Assistant 템플릿 생성',p.title),...state.events]};
  if(action==='template')return withTemplate;
  const due=new Date();due.setDate(due.getDate()+14);
  const dueString=[due.getFullYear(),String(due.getMonth()+1).padStart(2,'0'),String(due.getDate()).padStart(2,'0')].join('-');
  return addWork(withTemplate,p.title,template.id,state.profile,dueString,'');
}
