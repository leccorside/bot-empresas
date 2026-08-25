'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Shell, Status, Empty } from '../../components/Shell';

const leadStatusOrder = ['NEW', 'QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL', 'CUSTOMER', 'NOT_INTERESTED', 'DO_NOT_CONTACT'];
const closedStatuses = ['NOT_INTERESTED', 'DO_NOT_CONTACT'];
const leadStatusLabels: Record<string, string> = { NEW: 'Novo', QUALIFIED: 'Qualificado', CONTACT_PENDING: 'Contato pendente', CONTACTED: 'Contatado', REPLIED: 'Respondeu', INTERESTED: 'Interessado', MEETING: 'Reunião', PROPOSAL: 'Proposta', CUSTOMER: 'Cliente', NOT_INTERESTED: 'Sem interesse', DO_NOT_CONTACT: 'Não contatar' };
const CARDS_PER_COLUMN = 8;

function LeadCard({ business, onChanged }: { business: any; onChanged: () => void }) {
  const [history, setHistory] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleHistory() {
    if (history) { setHistory(null); return; }
    const detail = await api(`businesses/${business.id}`);
    setHistory(detail.leadEvents ?? []);
  }
  async function changeStatus(status: string) {
    const note = window.prompt(`Nota para mover "${business.name}" para "${leadStatusLabels[status]}" (opcional):`);
    if (note === null) return;
    setBusy(true);
    try { await api(`businesses/${business.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note: note || undefined }) }); await onChanged(); }
    finally { setBusy(false); }
  }

  return <div className="leadCard">
    <b>{business.name}</b>
    <div className="tableHint">{business.category} · {business.city}/{business.state}</div>
    <div className="tableHint">Score <b style={{ color: business.leadScore >= 60 ? 'var(--brand)' : 'inherit' }}>{business.leadScore}</b> · {business.phones?.[0]?.whatsappStatus === 'AVAILABLE' ? 'WhatsApp OK' : 'sem WhatsApp confirmado'}</div>
    <select className="input" disabled={busy} value="" onChange={e => e.target.value && changeStatus(e.target.value)}>
      <option value="">Mover para…</option>
      {leadStatusOrder.filter(status => status !== business.leadStatus).map(status => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}
    </select>
    <button type="button" className="btn secondary sm" onClick={toggleHistory}>{history ? 'Ocultar histórico' : 'Ver histórico'}</button>
    {history && <div className="leadHistory">{history.length ? history.map((event: any) => <div key={event.id} className="leadHistoryRow"><b>{leadStatusLabels[event.toStatus] ?? event.toStatus}</b> {event.fromStatus ? `(de ${leadStatusLabels[event.fromStatus] ?? event.fromStatus})` : ''} — {new Date(event.createdAt).toLocaleString('pt-BR')}{event.note ? <div>“{event.note}”</div> : null}</div>) : <div className="leadHistoryRow">Sem eventos registrados.</div>}</div>}
  </div>;
}

function PipelineColumn({ status, data, onChanged }: { status: string; data?: { items: any[]; total: number }; onChanged: () => void }) {
  return <div className={`pipelineColumn ${closedStatuses.includes(status) ? 'closed' : ''}`}>
    <div className="pipelineHeader"><span>{leadStatusLabels[status]}</span><span>{data?.total ?? 0}</span></div>
    <div className="pipelineCards">{data?.items?.length ? data.items.map(business => <LeadCard key={business.id} business={business} onChanged={onChanged} />) : <div className="tableHint">Vazio</div>}</div>
  </div>;
}

export default function CRM() {
  const [pipeline, setPipeline] = useState<Record<string, { items: any[]; total: number }>>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  async function loadPipeline() {
    const results = await Promise.all(leadStatusOrder.map(status => api(`businesses?leadStatus=${status}&pageSize=${CARDS_PER_COLUMN}`)));
    setPipeline(Object.fromEntries(leadStatusOrder.map((status, index) => [status, results[index]])));
  }
  async function loadCampaigns() { setCampaigns(await api('campaigns')); }
  useEffect(() => { void loadPipeline(); void loadCampaigns(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('campaigns', { method: 'POST', body: JSON.stringify({ name: form.get('name'), messageTemplate: form.get('messageTemplate'), filters: { city: form.get('city') || undefined, minScore: Number(form.get('minScore') || 0) } }) });
    setMsg('Campanha criada em rascunho.'); void loadCampaigns();
  }

  return <Shell title="CRM & Campanhas" subtitle="Acompanhe o funil de oportunidades e converta com segurança">
    <section className="card" style={{ marginBottom: 18 }}>
      <h2 className="sectionTitle">Pipeline de leads</h2>
      <div className="pipeline">{leadStatusOrder.map(status => <PipelineColumn key={status} status={status} data={pipeline[status]} onChanged={loadPipeline} />)}</div>
    </section>
    <section className="card" style={{ marginBottom: 18 }}>
      <h2 className="sectionTitle">Criar campanha</h2>
      <form onSubmit={submit} className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <input className="input" name="name" placeholder="Nome da campanha" required />
        <input className="input" name="city" placeholder="Cidade (opcional)" />
        <input className="input" name="minScore" type="number" placeholder="Score mínimo" />
        <textarea className="input" name="messageTemplate" style={{ gridColumn: '1 / 4' }} rows={3} defaultValue="Olá, {{empresa}}! Identificamos uma oportunidade para fortalecer sua presença digital. Podemos conversar?" />
        <button className="btn" style={{ width: 180 }}>Criar campanha</button>
      </form>
    </section>
    <section className="card">{campaigns.length ? <table className="table"><thead><tr><th>Campanha</th><th>Status</th><th>Mensagens</th><th>Criada</th><th>Ação</th></tr></thead><tbody>{campaigns.map(x => <tr key={x.id}><td>{x.name}</td><td><Status value={x.status} /></td><td>{x._count.messages}</td><td>{new Date(x.createdAt).toLocaleString('pt-BR')}</td><td>{x.status === 'DRAFT' && <button className="btn sm" onClick={() => api(`campaigns/${x.id}/schedule`, { method: 'POST' }).then(loadCampaigns)}>Preparar/envio</button>}</td></tr>)}</tbody></table> : <Empty>Nenhuma campanha criada.</Empty>}</section>
    {msg && <div className="toast">{msg}</div>}
  </Shell>;
}
