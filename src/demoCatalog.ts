import type { Agent, HubState } from './types';
// Entirely fictional examples. Organization-specific data must be entered in the UI.
export const catalogUsers = [{ id: 'unassigned', name: '미설정', team: '' }];
export function demoCatalog(profileId: string): Agent[] {
  return [
    { id: 'intake', name: '샘플 접수 assistant', lv2: '접수', summary: '대화로 요청을 남기고, 필요할 때 SR을 접수하는 예제입니다.', example: '검토를 요청할 내용을 설명해 주세요.' },
    { id: 'writing', name: '샘플 문서 assistant', lv2: '문서', summary: '태그로 연결된 자료를 선택해 대화에 사용하는 예제입니다.', example: '선택한 자료를 바탕으로 문서 작성을 요청해 보세요.' },
    { id: 'review', name: '샘플 검토 assistant', lv2: '검토', summary: '대화와 산출물을 저장하고 공유하는 예제입니다.', example: '자료에서 확인할 사항을 정리해 보세요.' },
  ].map(row => ({id: 'demo-' + row.id, catalog: true, name: row.name, lv1: '사용 예제', lv2: row.lv2, summary: row.summary, examples: [row.example], owner: 'unassigned', status: 'open', intake: row.id === 'intake', link1: '', link2: '', connectionMode: 'api', profileId, defaultModel: '', checklist: [], color: '#327466'}));
}
export function emptyDemoSeed(): HubState {
  return {version:1,session:{userId:'staff',role:'staff'},users:[{id:'staff',name:'업무 담당자',team:'데모'},{id:'requester',name:'요청자',team:'데모'},{id:'admin',name:'System Owner',team:'데모'},...catalogUsers],agents:demoCatalog('demo'),profiles:[{id:'demo',name:'샘플 연결',mode:'demo',baseUrl:'',chatPath:'/chat/completions',modelsPath:'/models',models:['demo-model'],defaultModel:'demo-model',sendNames:false}],works:[],threads:[],messages:[],artifacts:[],bundles:[],handoffs:[],requests:[],activities:[],notifications:[]};
}
