import {useEffect,useRef,useState} from 'react';
import {Sparkles,ArrowRight} from 'lucide-react';
import {useStore,navigate} from './store';
import {Modal,AssistantMark} from './ui';
import {DEFAULT_CONNECTION} from './workflow';
import {requestCompletion} from './llm';
import {parseProposal,applyProposal,type Proposal,type ProposalAction} from './systemProposal';

export function SystemAssistant({onClose}:{onClose:()=>void}){
  const {state,update,notify,apiKey}=useStore();
  const [prompt,setPrompt]=useState(''),[action,setAction]=useState<ProposalAction>('work'),[workId,setWorkId]=useState(state.works[0]?.id||''),[proposal,setProposal]=useState<Proposal|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const controller=useRef<AbortController|null>(null),config=state.connection||DEFAULT_CONNECTION;
  useEffect(()=>()=>controller.current?.abort(),[]);
  function invalidate(){controller.current?.abort();setProposal(null);setError('');}
  async function propose(){
    if(!prompt.trim()||busy)return;setError('');setProposal(null);setBusy(true);const c=new AbortController();controller.current=c;const timeout=setTimeout(()=>c.abort(),60000);
    try{
      if(config.mode==='api'){
        const targetWork=state.works.find(w=>w.id===workId);
        const targetContext=action==='task'&&targetWork?JSON.stringify({title:targetWork.title,tasks:targetWork.stages.map(t=>({name:t.name,short:t.short,mode:t.mode,status:t.status}))}):'해당 없음';
        const content=`MES 업무 구성 제안을 JSON 객체로만 작성하세요. 실제 작업을 수행하거나 승인하지 마세요. 다음 형식: {"title":"업무 또는 템플릿 이름","description":"설명","tasks":[{"name":"Task 이름","short":"약어","mode":"assistant 또는 manual","assistant":"assistant 이름, 수동이면 빈 문자열","checklist":["달성 기준"]}]}. tasks 1~20개, 각 checklist 1~20개. 요청 목적: ${action==='work'?'새 업무 생성':action==='template'?'새 워크플로우 템플릿 생성':'선택한 업무 끝에 Task 추가'}. 개발 및 실제 배포 실행은 수동으로 구성하세요. 대상 업무와 현재 Task 순서: ${targetContext}. 참고 가능한 모듈: ${JSON.stringify(state.modules?.map(m=>({name:m.name,short:m.short,mode:m.mode,assistant:m.assistant,checklist:m.checklist}))||[])}\n사용자 요청:\n${prompt}`;
        const response=await requestCompletion(config,apiKey,config.defaultModel,[{role:'user',content}],c.signal);
        if(!c.signal.aborted)setProposal(parseProposal(response));
      }else{
        const template=state.templates.find(t=>t.id===(/테스트|검증/.test(prompt)?'validation':/변경/.test(prompt)?'et-change':'et-standard'))||state.templates[0];
        const tasks=(action==='task'?template.stages.slice(0,1):template.stages).map(t=>({name:t.name,short:t.short,mode:t.mode,assistant:t.assistant,checklist:t.checklist?.map(c=>c.label)||['입력 자료와 범위 확인','산출물 검토 및 전달']}));
        setProposal({title:prompt.trim().slice(0,300),description:'샘플 제안 · 적용 전 Task 구성과 달성 기준을 확인하세요.',tasks});
      }
    }catch(e){if(controller.current===c)setError((e as Error).message);}finally{clearTimeout(timeout);setBusy(false);}
  }
  return <Modal title="시스템 assistant" subtitle={`업무 · 워크플로우 · Task 구성 제안 · ${config.mode==='api'?'사내 API / '+config.defaultModel:'샘플 모드'}`} onClose={onClose} wide>
    <div className="system-assistant-intro"><AssistantMark/><h3>어떤 업무 흐름이 필요한가요?</h3><p>Task 구성과 달성 기준을 제안하고, 검토한 내용을 적용합니다.</p></div>
    <div className="form-grid"><label className="form-label">만들 대상<select aria-label="시스템 assistant 만들 대상" value={action} disabled={busy} onChange={e=>{invalidate();setAction(e.target.value as ProposalAction);}}><option value="work">새 업무 + 워크플로우</option><option value="template">워크플로우 템플릿</option><option value="task">기존 업무에 Task 추가</option></select></label>{action==='task'&&<label className="form-label">대상 업무<select aria-label="Task 추가 대상 업무" value={workId} disabled={busy} onChange={e=>{invalidate();setWorkId(e.target.value);}}>{state.works.map(w=><option key={w.id} value={w.id}>{w.id} · {w.title}</option>)}</select></label>}</div>
    <form onSubmit={e=>{e.preventDefault();void propose();}}><div className="agent-input"><textarea aria-label="시스템 assistant 요청" value={prompt} disabled={busy} onChange={e=>{setPrompt(e.target.value);setProposal(null);}} placeholder="예: 설비 변경 영향도 검토와 수동 승인 Task를 포함한 흐름을 만들어 주세요" rows={3}/><button className="button primary" disabled={busy||!prompt.trim()}><Sparkles size={15}/>{busy?'제안 생성 중…':'흐름 제안받기'}</button></div></form>
    {busy&&<button className="button" onClick={()=>controller.current?.abort()}>요청 취소</button>}{error&&<p className="form-error" role="alert">{error}</p>}
    {proposal&&<div className="proposal-card"><div className="eyebrow">{config.mode==='api'?'API':'DEMO'} · REVIEW BEFORE APPLY</div><label className="form-label">제안 이름<input value={proposal.title} onChange={e=>setProposal({...proposal,title:e.target.value})}/></label><p>{proposal.description}</p><ol className="proposal-task-list">{proposal.tasks.map((t,i)=><li key={i}><strong>{t.short} · {t.name}</strong><span>{t.mode==='manual'?'수동 작업':t.assistant}</span><ul>{t.checklist.map((c,j)=><li key={j}>{c}</li>)}</ul></li>)}</ol><p className="muted">검토 후 적용하면 새 Task 모듈과 구성이 저장됩니다. 기존 작업 기록은 유지됩니다. 세부 구성은 워크플로우 편집에서 조정할 수 있습니다.</p><button className="button primary" onClick={()=>{try{const next=applyProposal(state,proposal,action,workId);update(()=>next);notify('검토한 제안을 적용했습니다.');onClose();navigate(action==='template'?'/templates':'/work/'+(action==='task'?workId:next.works[0].id));}catch(e){setError((e as Error).message);}}}>검토한 제안 적용<ArrowRight size={15}/></button></div>}
    <p className="connection-note">{config.mode==='api'?'설정된 시스템 기본 모델을 실제 호출합니다. 요청에는 입력 문장·모듈 정의 및 Task 추가 시 대상 업무명·단계 구성이 포함됩니다.':'샘플 모드에서는 기존 템플릿 기반 예시를 보여 줍니다. 실제 LLM 제안은 API 모드에서 사용할 수 있습니다.'}</p>
  </Modal>;
}
