'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Shell, Status, Empty } from '../../components/Shell';

const leadStatusOrder = ['NEW', 'QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL', 'CUSTOMER', 'NOT_INTERESTED', 'DO_NOT_CONTACT'];
const closedStatuses = ['NOT_INTERESTED', 'DO_NOT_CONTACT'];
const leadStatusLabels: Record<string, string> = { NEW: 'Novo', QUALIFIED: 'Qualificado', CONTACT_PENDING: 'Contato pendente', CONTACTED: 'Contatado', REPLIED: 'Respondeu', INTERESTED: 'Interessado', MEETING: 'Reunião', PROPOSAL: 'Proposta', CUSTOMER: 'Cliente', NOT_INTERESTED: 'Sem interesse', DO_NOT_CONTACT: 'Não contatar' };
const CARDS_PER_COLUMN = 8;
const templateVariableNames = ['nome_empresa', 'cidade', 'categoria'];
const templateVariableLabels: Record<string, string> = { nome_empresa: 'Nome da empresa', cidade: 'Cidade', categoria: 'Categoria' };
const templateStatusLabels: Record<string, string> = { DRAFT: 'RASCUNHO', PENDING: 'EM ANÁLISE', APPROVED: 'ONLINE', REJECTED: 'FAILED', DISABLED: 'CANCELLED' };
const initialTemplateForm = { name: '', language: 'pt_BR', category: 'MARKETING', bodyText: '', variables: [] as string[] };

function TemplatesSection({ templates, onChanged }: { templates: any[]; onChanged: () => void }) {
  const [form, setForm] = useState(initialTemplateForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function toggleVariable(name: string) {
    setForm(current => ({ ...current, variables: current.variables.includes(name) ? current.variables.filter(v => v !== name) : [...current.variables, name] }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('templates', { method: 'POST', body: JSON.stringify(form) }); setForm(initialTemplateForm); onChanged(); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }
  async function action(id: string, path: string) {
    setBusy(true); setError('');
    try { await api(`templates/${id}/${path}`, { method: 'POST' }); onChanged(); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }
  async function remove(template: any) {
    if (!confirm(`Excluir o template "${template.name}"?`)) return;
    setBusy(true); setError('');
    try { await api(`templates/${template.id}`, { method: 'DELETE' }); onChanged(); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }

  return <section className="card" style={{ marginBottom: 18 }}>
    <div className="filtersHeader"><h2 className="sectionTitle">Templates de mensagem</h2>{error && <span className="filterError">{error}</span>}</div>
    <form className="scheduleForm" onSubmit={submit} style={{ marginBottom: 16 }}>
      <label className="field"><span>Nome (minúsculas e sublinhado)</span><input className="input" value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} placeholder="oportunidade_site" required /></label>
      <label className="field"><span>Idioma</span><input className="input" value={form.language} onChange={e => setForm(c => ({ ...c, language: e.target.value }))} required /></label>
      <label className="field"><span>Categoria</span><select className="input" value={form.category} onChange={e => setForm(c => ({ ...c, category: e.target.value }))}><option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option><option value="AUTHENTICATION">Autenticação</option></select></label>
      <div className="field scheduleDays"><span>Variáveis</span><div>{templateVariableNames.map((name, index) => <label key={name}><input type="checkbox" checked={form.variables.includes(name)} onChange={() => toggleVariable(name)} /> {`{{${index + 1}}}`} {templateVariableLabels[name]}</label>)}</div></div>
      <label className="field" style={{ gridColumn: '1 / 3' }}><span>Corpo da mensagem</span><textarea className="input" rows={3} value={form.bodyText} onChange={e => setForm(c => ({ ...c, bodyText: e.target.value }))} placeholder="Olá {{1}}! Identificamos uma oportunidade para fortalecer sua presença digital." required /></label>
      <div className="scheduleActions"><button className="btn" disabled={busy}>Criar template</button></div>
    </form>
    {templates.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Nome</th><th>Categoria</th><th>Idioma</th><th>Corpo</th><th>Status</th><th>Ações</th></tr></thead><tbody>{templates.map(template => <tr key={template.id}><td>{template.name}</td><td>{template.category}</td><td>{template.language}</td><td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={template.bodyText}>{template.bodyText}</td><td><Status value={templateStatusLabels[template.status] ?? template.status} />{template.rejectionReason && <div className="tableHint">{template.rejectionReason}</div>}</td><td><div className="rowActions">{['DRAFT', 'REJECTED'].includes(template.status) && <button disabled={busy} className="btn secondary sm" onClick={() => action(template.id, 'submit')}>Enviar p/ aprovação</button>}{template.status === 'PENDING' && <button disabled={busy} className="btn secondary sm" onClick={() => action(template.id, 'sync')}>Sincronizar</button>}<button disabled={busy} className="btn danger sm" onClick={() => remove(template)}>Excluir</button></div></td></tr>)}</tbody></table></div> : <Empty>Nenhum template cadastrado ainda.</Empty>}
  </section>;
}

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

function CampaignRow({ campaign, onChanged }: { campaign: any; onChanged: () => void }) {
  const [messages, setMessages] = useState<any[] | null>(null);

  async function toggleMessages() {
    if (messages) { setMessages(null); return; }
    setMessages(await api(`campaigns/${campaign.id}/messages`));
  }

  return <>
    <tr>
      <td>{campaign.name}</td><td><Status value={campaign.status} /></td><td>{campaign._count.messages}</td><td>{new Date(campaign.createdAt).toLocaleString('pt-BR')}</td>
      <td><div className="rowActions">{campaign.status === 'DRAFT' && <button className="btn sm" onClick={() => api(`campaigns/${campaign.id}/schedule`, { method: 'POST' }).then(onChanged)}>Preparar/envio</button>}{campaign._count.messages > 0 && <button type="button" className="btn secondary sm" onClick={toggleMessages}>{messages ? 'Ocultar mensagens' : 'Ver mensagens'}</button>}</div></td>
    </tr>
    {messages && <tr><td colSpan={5}>{messages.length ? <div className="tableWrap"><table className="table compactTable"><thead><tr><th>Empresa</th><th>Telefone</th><th>Status</th><th>Enviada</th><th>Entregue</th><th>Lida</th><th>Respondida</th></tr></thead><tbody>{messages.map(message => <tr key={message.id}><td>{message.business?.name ?? '—'}</td><td>{message.phone}</td><td><Status value={message.status} /></td><td>{message.sentAt ? new Date(message.sentAt).toLocaleString('pt-BR') : '—'}</td><td>{message.deliveredAt ? new Date(message.deliveredAt).toLocaleString('pt-BR') : '—'}</td><td>{message.readAt ? new Date(message.readAt).toLocaleString('pt-BR') : '—'}</td><td>{message.repliedAt ? new Date(message.repliedAt).toLocaleString('pt-BR') : '—'}</td></tr>)}</tbody></table></div> : <Empty>Nenhuma mensagem gerada ainda.</Empty>}</td></tr>}
  </>;
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
  const [templates, setTemplates] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const approvedTemplates = templates.filter(template => template.status === 'APPROVED');

  async function loadPipeline() {
    const results = await Promise.all(leadStatusOrder.map(status => api(`businesses?leadStatus=${status}&pageSize=${CARDS_PER_COLUMN}`)));
    setPipeline(Object.fromEntries(leadStatusOrder.map((status, index) => [status, results[index]])));
  }
  async function loadCampaigns() { setCampaigns(await api('campaigns')); }
  async function loadTemplates() { setTemplates(await api('templates')); }
  useEffect(() => { void loadPipeline(); void loadCampaigns(); void loadTemplates(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('campaigns', { method: 'POST', body: JSON.stringify({ name: form.get('name'), templateId: form.get('templateId'), filters: { city: form.get('city') || undefined, minScore: Number(form.get('minScore') || 0) } }) });
      setMsg('Campanha criada em rascunho.'); void loadCampaigns();
    } catch (reason: any) { setError(reason.message); }
  }

  return <Shell title="CRM & Campanhas" subtitle="Acompanhe o funil de oportunidades e converta com segurança">
    <section className="card" style={{ marginBottom: 18 }}>
      <h2 className="sectionTitle">Pipeline de leads</h2>
      <div className="pipeline">{leadStatusOrder.map(status => <PipelineColumn key={status} status={status} data={pipeline[status]} onChanged={loadPipeline} />)}</div>
    </section>
    <TemplatesSection templates={templates} onChanged={loadTemplates} />
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="filtersHeader"><h2 className="sectionTitle">Criar campanha</h2>{error && <span className="filterError">{error}</span>}</div>
      {approvedTemplates.length ? <form onSubmit={submit} className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
        <input className="input" name="name" placeholder="Nome da campanha" required />
        <select className="input" name="templateId" required defaultValue=""><option value="" disabled>Template aprovado…</option>{approvedTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
        <input className="input" name="city" placeholder="Cidade (opcional)" />
        <input className="input" name="minScore" type="number" placeholder="Score mínimo" />
        <button className="btn" style={{ width: 180 }}>Criar campanha</button>
      </form> : <Empty>Cadastre e aprove um template acima antes de criar uma campanha.</Empty>}
    </section>
    <section className="card">{campaigns.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Campanha</th><th>Status</th><th>Mensagens</th><th>Criada</th><th>Ação</th></tr></thead><tbody>{campaigns.map(x => <CampaignRow key={x.id} campaign={x} onChanged={loadCampaigns} />)}</tbody></table></div> : <Empty>Nenhuma campanha criada.</Empty>}</section>
    {msg && <div className="toast">{msg}</div>}
  </Shell>;
}
