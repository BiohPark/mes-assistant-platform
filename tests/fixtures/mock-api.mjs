// Local QA fixture only. Never a production inference server.
// Run: node tests/fixtures/mock-api.mjs [port]
import {createServer} from 'node:http';
const port=Number(process.argv[2]||5176);
createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5175');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'qa-task-model'},{id:'qa-thread-model'}]}));return;}
  if(req.url!=='/v1/chat/completions'||req.method!=='POST'){res.writeHead(404);res.end('{}');return;}
  try{
    let raw='';for await(const part of req){raw+=part;if(raw.length>1000000)throw new Error('limit');}
    const body=JSON.parse(raw),last=body.messages.at(-1)?.content||'';
    const proposal={title:'API 제안 검증 업무',description:'로컬 QA 서버가 반환한 제안입니다.',tasks:[{name:'수동 영향도 검토',short:'IMPACT',mode:'manual',assistant:'',checklist:['영향 범위 확인','검토 증빙 확인']}]};
    const content=last.includes('MES 업무 구성 제안')?JSON.stringify(proposal):`로컬 테스트 API 응답\n모델: ${body.model}\n전달 메시지: ${body.messages.length}개\n${last}`;
    res.end(JSON.stringify({choices:[{message:{role:'assistant',content}}]}));
  }catch{res.writeHead(400);res.end('{"error":"invalid test request"}');}
}).listen(port,'127.0.0.1',()=>console.log(`Local QA API http://127.0.0.1:${port}/v1`));
