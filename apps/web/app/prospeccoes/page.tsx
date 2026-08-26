'use client';
import {FormEvent,useEffect,useState} from 'react';import {api} from '../../lib/api';import {Shell,Status,Empty} from '../../components/Shell';
const CATEGORIES=['Todos','Restaurantes','Academias','Clínicas','Dentistas','Advogados','Hotéis','Pousadas','Imobiliárias','Oficinas','Lojas','Mercados'];

function growth(value:number|null){if(value==null)return <span className="tableHint">execução inicial</span>;if(value===0)return <span>— estável</span>;return <span style={{color:value>0?'var(--brand)':'var(--danger)'}}>{value>0?'▲ +':'▼ '}{value}</span>}

function HistoryGroup({group}:{group:any}){
  return <div className="tableWrap" style={{marginBottom:16}}>
    <div className="sub" style={{marginBottom:8}}><b>{group.destination.city}/{group.destination.state}</b> · {group.destination.category}</div>
    <table className="table"><thead><tr><th>Execução</th><th>Status</th><th>Empresas</th><th>Crescimento</th><th>Novas</th><th>Duplicatas</th><th>Oportunidades HIGH</th><th>Crescimento oport.</th></tr></thead>
      <tbody>{group.runs.map((run:any)=><tr key={run.id}><td>{new Date(run.createdAt).toLocaleString('pt-BR')}</td><td><Status value={run.status}/></td><td>{run.businessesFound}</td><td>{growth(run.growthBusinesses)}</td><td>{run.businessesNew}</td><td>{run.duplicatesFound}</td><td>{run.opportunitiesFound}</td><td>{growth(run.growthOpportunities)}</td></tr>)}</tbody>
    </table>
  </div>;
}

export default function Runs(){
  const [runs,setRuns]=useState<any[]>([]),[message,setMessage]=useState('');
  const [categories,setCategories]=useState<string[]>(['Todos']),[submitting,setSubmitting]=useState(false);
  const [history,setHistory]=useState<any[]>([]);
  const [options,setOptions]=useState<any>({locations:[],categories:[]});
  const [historyFilters,setHistoryFilters]=useState({state:'',city:'',category:''});
  const load=()=>api('runs').then(setRuns);
  const loadHistory=(filters=historyFilters)=>{const params=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v)params.set(k,v as string)});api(`runs/history?${params.toString()}`).then(setHistory)};
  useEffect(()=>{load();api('businesses/filter-options').then(setOptions);loadHistory(historyFilters);const i=setInterval(load,5000);return()=>clearInterval(i)},[]);
  const cities=options.locations.filter((l:any)=>!historyFilters.state||l.state===historyFilters.state);
  const states=Array.from(new Set<string>(options.locations.map((l:any)=>l.state)));
  function toggleCategory(category:string){setCategories(current=>category==='Todos'?['Todos']:current.includes(category)?(current.filter(item=>item!==category).length?current.filter(item=>item!==category):['Todos']):[...current.filter(item=>item!=='Todos'),category])}
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setSubmitting(true);try{const base=Object.fromEntries(new FormData(e.currentTarget));await Promise.all(categories.map(category=>api('runs',{method:'POST',body:JSON.stringify({...base,category})})));setMessage(`${categories.length} prospecção${categories.length>1?'ões':''} adicionada${categories.length>1?'s':''} à fila.`);load();loadHistory()}finally{setSubmitting(false)}}
  function submitHistoryFilter(e:FormEvent<HTMLFormElement>){e.preventDefault();loadHistory(historyFilters)}
  return <Shell title="Nova prospecção" subtitle="Descubra e qualifique empresas por localização">
    <section className="card" style={{marginBottom:18}}><form className="form prospectingForm" onSubmit={submit}><div className="field"><label>PAÍS</label><input name="country" className="input" defaultValue="Brasil"/></div><div className="field"><label>ESTADO</label><input name="state" className="input" defaultValue="Goiás" required/></div><div className="field"><label>CIDADE</label><input name="city" className="input" defaultValue="Caldas Novas" required/></div><div className="field categoryPicker"><label>CATEGORIAS ({categories.length})</label><div>{CATEGORIES.map(category=><button key={category} type="button" className={`categoryChip ${categories.includes(category)?'selected':''}`} onClick={()=>toggleCategory(category)}>{category}</button>)}</div></div><button className="btn" disabled={submitting}>{submitting?'Adicionando…':'Executar agora'}</button></form></section>
    <section className="card"><h2 className="sectionTitle">Histórico de execuções</h2>{runs.length?<div className="tableWrap"><table className="table"><thead><tr><th>Destino</th><th>Categoria</th><th>Etapa</th><th>Status</th><th>Encontradas</th><th>Novas</th><th>Células</th><th>Checkpoints</th><th>Ações</th></tr></thead><tbody>{runs.map(r=><tr key={r.id}><td>{r.city} / {r.state}</td><td>{r.category}</td><td>{r.currentStage}</td><td><Status value={r.status}/></td><td>{r.businessesFound}</td><td>{r.businessesNew}</td><td><b>{r.gridCellsCompleted??0}/{r.gridCellsTotal??r._count?.cells??0}</b></td><td>{r._count?.checkpoints??0}</td><td>{r.status==='FAILED'&&<button className="btn sm secondary" onClick={()=>api(`runs/${r.id}/retry`,{method:'POST'}).then(load)}>Reprocessar</button>}</td></tr>)}</tbody></table></div>:<Empty>Crie sua primeira prospecção acima.</Empty>}</section>
    <section className="card">
      <h2 className="sectionTitle">Comparar crescimento entre execuções</h2>
      <form className="filterGrid" style={{marginBottom:16}} onSubmit={submitHistoryFilter}>
        <label className="field"><span>Estado</span><select className="input" value={historyFilters.state} onChange={e=>setHistoryFilters(c=>({...c,state:e.target.value,city:''}))}><option value="">Todos</option>{states.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        <label className="field"><span>Cidade</span><select className="input" value={historyFilters.city} onChange={e=>setHistoryFilters(c=>({...c,city:e.target.value}))}><option value="">Todas</option>{cities.map((l:any)=><option key={`${l.state}-${l.city}`} value={l.city}>{l.city}</option>)}</select></label>
        <label className="field"><span>Categoria</span><select className="input" value={historyFilters.category} onChange={e=>setHistoryFilters(c=>({...c,category:e.target.value}))}><option value="">Todas</option>{options.categories.map((c:string)=><option key={c} value={c}>{c}</option>)}</select></label>
        <div className="filterActions"><button className="btn" type="submit">Comparar</button></div>
      </form>
      {history.length?history.map((group:any)=><HistoryGroup key={`${group.destination.city}-${group.destination.state}-${group.destination.category}`} group={group}/>):<Empty>Nenhuma execução concluída para comparar ainda.</Empty>}
    </section>
    {message&&<div className="toast">{message}</div>}
  </Shell>;
}
