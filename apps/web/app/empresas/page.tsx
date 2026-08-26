'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, downloadUrl } from '../../lib/api';
import { Empty, Shell, Status } from '../../components/Shell';

type Filters = {
  search: string; state: string; city: string; category: string; hasWebsite: string; siteStatus: string;
  hasPhone: string; whatsappStatus: string; minRating: string; maxRating: string; minReviews: string;
  maxReviews: string; minScore: string; maxScore: string;
};

const initialFilters: Filters = { search: '', state: '', city: '', category: '', hasWebsite: '', siteStatus: '', hasPhone: '', whatsappStatus: '', minRating: '', maxRating: '', minReviews: '', maxReviews: '', minScore: '', maxScore: '' };
const siteLabels: Record<string, string> = { NO_WEBSITE: 'Sem site', POOR: 'Ruim', AVERAGE: 'Médio', GOOD: 'Bom', UNKNOWN: 'Desconhecido' };
const whatsappLabels: Record<string, string> = { UNKNOWN: 'Desconhecido', AVAILABLE: 'Disponível', NOT_AVAILABLE: 'Indisponível', INVALID: 'Inválido' };
const segmentFilterKeys = ['city', 'category', 'hasWebsite', 'siteStatus', 'minScore', 'maxScore', 'minReviews', 'maxReviews'] as const;

function segmentFiltersToParams(filters: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const key of segmentFilterKeys) if (filters[key] !== undefined) params.set(key, String(filters[key]));
  return params;
}

function WebsiteSummary({ business }: { business: any }) {
  if (!business.website) return <Status value="NO_WEBSITE" />;
  const safeUrl = /^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`;
  const technologies = Array.isArray(business.technologies) ? business.technologies.join(', ') : '';
  return <div className="websiteSummary"><div><a href={safeUrl} target="_blank" rel="noreferrer">Abrir site</a> <Status value={business.siteStatus} /></div><small>{business.siteHttpStatus ?? 'HTTP —'} · {business.siteResponseMs != null ? `${business.siteResponseMs} ms` : 'tempo —'} · {business.hasHttps ? 'HTTPS' : 'sem HTTPS'} · {business.siteSslValid ? 'SSL válido' : 'SSL —'} · {business.hasViewport ? 'responsivo' : 'viewport —'} · {business.performanceScore != null ? `PageSpeed ${business.performanceScore}` : 'PageSpeed —'}</small>{technologies && <small title={technologies}>{technologies}</small>}</div>;
}

function BusinessRow({ business, analyzingId, onAnalyze }: { business: any; analyzingId: string; onAnalyze: (business: any) => void }) {
  const [insight, setInsight] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!insight) { const current = await api(`businesses/${business.id}/insight`); if (current) setInsight(current); }
  }
  async function generate() {
    setBusy(true);
    try { setInsight(await api(`businesses/${business.id}/insight`, { method: 'POST' })); }
    finally { setBusy(false); }
  }
  async function approve() {
    setBusy(true);
    try { setInsight(await api(`businesses/${business.id}/insight/approve`, { method: 'POST' })); }
    finally { setBusy(false); }
  }

  return <>
    <tr>
      <td><b>{business.name}</b></td><td>{business.category}</td><td>{business.city}/{business.state}</td><td>{business.phone ?? '—'}</td><td>{business.phones?.[0]?.whatsappStatus ?? 'UNKNOWN'}</td><td><WebsiteSummary business={business} /></td><td>{business.rating ?? '—'}</td><td>{business.reviewsCount ?? 0}</td><td><b style={{ color: business.leadScore >= 60 ? 'var(--brand)' : 'inherit' }}>{business.leadScore}</b></td><td><Status value={business.leadStatus} /></td>
      <td><div className="rowActions"><button className="btn secondary sm" disabled={!business.website || analyzingId === business.id} onClick={() => onAnalyze(business)}>{analyzingId === business.id ? 'Analisando…' : 'Analisar site'}</button><button type="button" className="btn secondary sm" onClick={toggle}>{open ? 'Ocultar IA' : 'Insight IA'}</button></div></td>
    </tr>
    {open && <tr><td colSpan={11}>
      {insight ? <div className="leadCard" style={{ maxWidth: 640 }}>
        <div className="tableHint">Gerado por {insight.model === 'demo' ? 'modo demo (sem OPENAI_API_KEY)' : insight.model} em {new Date(insight.generatedAt).toLocaleString('pt-BR')} {insight.approved && <Status value="ONLINE" />}</div>
        <b>Análise</b><p style={{ margin: '4px 0 10px' }}>{insight.summary}</p>
        <b>Sugestão de abordagem</b><p style={{ margin: '4px 0 10px' }}>{insight.suggestedPitch}</p>
        <div className="rowActions"><button disabled={busy} className="btn secondary sm" onClick={generate}>Gerar novamente</button>{!insight.approved && <button disabled={busy} className="btn sm" onClick={approve}>Aprovar sugestão</button>}</div>
      </div> : <Empty>Nenhum insight gerado ainda para esta empresa. <button disabled={busy} className="btn sm" style={{ marginLeft: 8 }} onClick={generate}>{busy ? 'Gerando…' : 'Gerar insight IA'}</button></Empty>}
    </td></tr>}
  </>;
}

export default function Businesses() {
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [options, setOptions] = useState<any>({ locations: [], categories: [], siteStatuses: [], whatsappStatuses: [] });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [exports, setExports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState('');
  const [analyzingId, setAnalyzingId] = useState('');
  const [error, setError] = useState('');
  const [segmentGoal, setSegmentGoal] = useState('');
  const [segmentSuggestion, setSegmentSuggestion] = useState<any>(null);
  const [segmentBusy, setSegmentBusy] = useState(false);
  const [segmentCount, setSegmentCount] = useState<number | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaignForm, setCampaignForm] = useState({ name: '', templateId: '' });
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState('');
  const [batch, setBatch] = useState<any>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const approvedTemplates = templates.filter((template: any) => template.status === 'APPROVED');
  const segmentHasFilters = Object.keys(segmentSuggestion?.filters ?? {}).length > 0;
  const cities = useMemo(() => options.locations.filter((location: any) => !filters.state || location.state === filters.state), [options.locations, filters.state]);
  const states = useMemo(() => Array.from(new Set<string>(options.locations.map((location: any) => location.state))), [options.locations]);

  async function load(next = filters) {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(next).forEach(([key, value]) => { if (value !== '') params.set(key, value); });
      setData(await api(`businesses?${params.toString()}`));
    } catch (requestError: any) { setError(requestError.message ?? 'Não foi possível aplicar os filtros'); }
    finally { setLoading(false); }
  }

  async function loadExports() { try { setExports(await api('exports')); } catch (requestError: any) { setError(requestError.message); } }
  useEffect(() => { api('businesses/filter-options').then(setOptions); load(initialFilters); loadExports(); api('templates').then(setTemplates); }, []);
  useEffect(() => {
    if (!segmentHasFilters) { setSegmentCount(null); return; }
    api(`businesses?${segmentFiltersToParams(segmentSuggestion.filters).toString()}&pageSize=1`).then(result => setSegmentCount(result.total)).catch(() => setSegmentCount(null));
  }, [segmentSuggestion]);
  useEffect(() => {
    if (!batch || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(batch.status)) return;
    const timer = setInterval(() => { api(`insights/batch/${batch.id}`).then(setBatch).catch(() => {}); }, 2000);
    return () => clearInterval(timer);
  }, [batch?.id, batch?.status]);
  function submit(event: FormEvent) { event.preventDefault(); load(); }
  function clear() { setFilters(initialFilters); load(initialFilters); }
  function update(key: keyof Filters, value: string) { setFilters(current => ({ ...current, [key]: value })); }

  async function download(path: string, filename: string) {
    const token = localStorage.getItem('token');
    const response = await fetch(downloadUrl(path), { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Falha ao exportar (${response.status})`);
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }

  async function createExport(format: 'CSV' | 'XLSX') {
    setExportBusy(format); setError('');
    try {
      const record = await api('exports/businesses', { method: 'POST', body: JSON.stringify({ format, filters }) });
      await loadExports(); await download(`exports/${record.id}/download`, record.filename);
    } catch (requestError: any) { setError(requestError.message ?? 'Falha ao gerar exportação'); }
    finally { setExportBusy(''); }
  }

  async function suggestSegment() {
    setSegmentBusy(true); setError('');
    try { setSegmentSuggestion(await api('segments/suggest', { method: 'POST', body: JSON.stringify({ goal: segmentGoal }) })); }
    catch (requestError: any) { setError(requestError.message ?? 'Falha ao sugerir segmento'); }
    finally { setSegmentBusy(false); }
  }
  function applySuggestedFilters() {
    const f: Record<string, unknown> = segmentSuggestion?.filters ?? {};
    setFilters(current => {
      const next = { ...current };
      for (const key of segmentFilterKeys) if (f[key] !== undefined) (next as any)[key] = String(f[key]);
      return next;
    });
  }
  async function createCampaignFromSegment(event: FormEvent) {
    event.preventDefault(); setCampaignBusy(true); setError(''); setCampaignMessage('');
    try {
      await api('campaigns', { method: 'POST', body: JSON.stringify({ name: campaignForm.name, templateId: campaignForm.templateId, filters: segmentSuggestion.filters }) });
      setCampaignMessage('Campanha criada em rascunho a partir do segmento. Vá em CRM & Campanhas para revisar e agendar o envio.');
      setCampaignForm({ name: '', templateId: '' });
    } catch (requestError: any) { setError(requestError.message ?? 'Falha ao criar campanha'); }
    finally { setCampaignBusy(false); }
  }

  async function analyze(business: any) {
    setAnalyzingId(business.id); setError('');
    try {
      const requestedAt = Date.now();
      await api(`businesses/${business.id}/website-analysis`, { method: 'POST' });
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const current = await api(`businesses/${business.id}`);
        if (current.websiteCheckedAt && new Date(current.websiteCheckedAt).getTime() >= requestedAt) break;
      }
      await load();
    } catch (requestError: any) { setError(requestError.message ?? 'Falha ao analisar website'); }
    finally { setAnalyzingId(''); }
  }

  async function startInsightBatch() {
    if (!confirm(`Gerar insights de IA em lote para as empresas do filtro atual que ainda não têm insight (respeitando o limite por lote)? Isso consome créditos das APIs de IA.`)) return;
    setBatchBusy(true); setError('');
    try { setBatch(await api('insights/batch', { method: 'POST', body: JSON.stringify({ filters, onlyMissing: true }) })); }
    catch (requestError: any) { setError(requestError.message ?? 'Falha ao iniciar geração em lote'); }
    finally { setBatchBusy(false); }
  }
  async function cancelInsightBatch() {
    if (!batch) return;
    try { setBatch(await api(`insights/batch/${batch.id}/cancel`, { method: 'POST' })); }
    catch (requestError: any) { setError(requestError.message ?? 'Falha ao cancelar lote'); }
  }

  const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  return <Shell title="Empresas" subtitle={`${data.total ?? 0} empresas correspondem aos filtros`}>
    <section className="card filtersCard">
      <div className="filtersHeader"><h2 className="sectionTitle">Segmentação IA</h2></div>
      <div className="filterGrid">
        <label className="field filterSearch"><span>Objetivo (texto livre)</span><input className="input" placeholder="Ex: empresas sem site em Caldas Novas, ideal para oferta de criação de site" value={segmentGoal} onChange={event => setSegmentGoal(event.target.value)} /></label>
        <div className="filterActions"><button type="button" className="btn secondary" disabled={segmentBusy || segmentGoal.trim().length < 5} onClick={suggestSegment}>{segmentBusy ? 'Sugerindo…' : 'Sugerir filtros'}</button></div>
      </div>
      {segmentSuggestion && <div className="tableHint" style={{ marginTop: 10 }}>
        {segmentSuggestion.explanation} {segmentHasFilters && <>
          <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={applySuggestedFilters}>Usar esses filtros</button>
          {segmentCount != null && <span style={{ marginLeft: 8 }}>· {segmentCount} empresa(s) correspondem</span>}
        </>}
      </div>}
      {segmentSuggestion && segmentHasFilters && (approvedTemplates.length
        ? <form className="filterGrid" style={{ marginTop: 12 }} onSubmit={createCampaignFromSegment}>
            <input className="input" placeholder="Nome da campanha" value={campaignForm.name} onChange={event => setCampaignForm(current => ({ ...current, name: event.target.value }))} required />
            <select className="input" value={campaignForm.templateId} onChange={event => setCampaignForm(current => ({ ...current, templateId: event.target.value }))} required>
              <option value="" disabled>Template aprovado…</option>
              {approvedTemplates.map((template: any) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <div className="filterActions"><button className="btn" type="submit" disabled={campaignBusy}>{campaignBusy ? 'Criando…' : 'Criar campanha com este segmento'}</button></div>
          </form>
        : <div className="tableHint" style={{ marginTop: 8 }}>Cadastre e aprove um template em CRM &amp; Campanhas para criar uma campanha a partir deste segmento.</div>)}
    </section>
    <section className="card filtersCard">
      <div className="filtersHeader"><h2 className="sectionTitle">Filtros</h2><span className={error ? 'filterError' : ''}>{error || (loading ? 'Atualizando…' : `${data.total ?? 0} resultados`)}</span></div>
      <form className="filterGrid" onSubmit={submit}>
        <label className="field filterSearch"><span>Empresa ou endereço</span><input className="input" placeholder="Buscar…" value={filters.search} onChange={event => update('search', event.target.value)} /></label>
        <label className="field"><span>Estado</span><select className="input" value={filters.state} onChange={event => setFilters(current => ({ ...current, state: event.target.value, city: '' }))}><option value="">Todos</option>{states.map(state => <option key={state} value={state}>{state}</option>)}</select></label>
        <label className="field"><span>Cidade</span><select className="input" value={filters.city} onChange={event => update('city', event.target.value)}><option value="">Todas</option>{cities.map((location: any) => <option key={`${location.state}-${location.city}`} value={location.city}>{location.city}</option>)}</select></label>
        <label className="field"><span>Categoria</span><select className="input" value={filters.category} onChange={event => update('category', event.target.value)}><option value="">Todas</option>{options.categories.map((category: string) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="field"><span>Presença de site</span><select className="input" value={filters.hasWebsite} onChange={event => update('hasWebsite', event.target.value)}><option value="">Todos</option><option value="true">Com site</option><option value="false">Sem site</option></select></label>
        <label className="field"><span>Status do site</span><select className="input" value={filters.siteStatus} onChange={event => update('siteStatus', event.target.value)}><option value="">Todos</option>{options.siteStatuses.map((status: string) => <option key={status} value={status}>{siteLabels[status] ?? status}</option>)}</select></label>
        <label className="field"><span>Telefone</span><select className="input" value={filters.hasPhone} onChange={event => update('hasPhone', event.target.value)}><option value="">Todos</option><option value="true">Com telefone</option><option value="false">Sem telefone</option></select></label>
        <label className="field"><span>WhatsApp</span><select className="input" value={filters.whatsappStatus} onChange={event => update('whatsappStatus', event.target.value)}><option value="">Todos</option>{options.whatsappStatuses.map((status: string) => <option key={status} value={status}>{whatsappLabels[status] ?? status}</option>)}</select></label>
        <label className="field"><span>Rating mínimo</span><input className="input" type="number" min="0" max="5" step="0.1" value={filters.minRating} onChange={event => update('minRating', event.target.value)} /></label>
        <label className="field"><span>Rating máximo</span><input className="input" type="number" min="0" max="5" step="0.1" value={filters.maxRating} onChange={event => update('maxRating', event.target.value)} /></label>
        <label className="field"><span>Avaliações mínimas</span><input className="input" type="number" min="0" step="1" value={filters.minReviews} onChange={event => update('minReviews', event.target.value)} /></label>
        <label className="field"><span>Avaliações máximas</span><input className="input" type="number" min="0" step="1" value={filters.maxReviews} onChange={event => update('maxReviews', event.target.value)} /></label>
        <label className="field"><span>Score mínimo</span><input className="input" type="number" min="0" max="100" value={filters.minScore} onChange={event => update('minScore', event.target.value)} /></label>
        <label className="field"><span>Score máximo</span><input className="input" type="number" min="0" max="100" value={filters.maxScore} onChange={event => update('maxScore', event.target.value)} /></label>
        <div className="filterActions"><button className="btn" type="submit" disabled={loading}>{loading ? 'Filtrando…' : 'Aplicar filtros'}</button><button className="btn secondary" type="button" onClick={clear}>Limpar</button></div>
      </form>
    </section>
    <div className="toolbar">
      <button disabled={batchBusy || (batch && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(batch.status))} className="btn secondary" onClick={startInsightBatch}>{batchBusy ? 'Iniciando…' : 'Gerar insights em lote'}</button>
      <span className="spacer"/>
      <button disabled={Boolean(exportBusy)} className="btn secondary" onClick={() => createExport('CSV')}>{exportBusy === 'CSV' ? 'Gerando CSV…' : 'Exportar CSV'}</button><button disabled={Boolean(exportBusy)} className="btn secondary" onClick={() => createExport('XLSX')}>{exportBusy === 'XLSX' ? 'Gerando XLSX…' : 'Exportar XLSX'}</button>
    </div>
    {batch && <section className="card">
      <div className="filtersHeader"><h2 className="sectionTitle">Geração de insights em lote</h2><Status value={batch.status} /></div>
      <div className="tableHint">{batch.processedCount}/{batch.totalBusinesses} processadas · {batch.generatedCount} geradas · {batch.failedCount} falharam{batch.errorMessage ? ` · ${batch.errorMessage}` : ''}</div>
      {['WAITING', 'ACTIVE', 'RECOVERING'].includes(batch.status) && <div className="rowActions" style={{ marginTop: 8 }}><button className="btn secondary sm" onClick={cancelInsightBatch}>Cancelar lote</button></div>}
      {batch.status === 'COMPLETED' && <div className="rowActions" style={{ marginTop: 8 }}><button className="btn secondary sm" onClick={() => load()}>Atualizar lista</button></div>}
    </section>}
    <section className="card">{data.items.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Empresa</th><th>Categoria</th><th>Cidade</th><th>Telefone</th><th>WhatsApp</th><th>Website Analyzer</th><th>Rating</th><th>Avaliações</th><th>Lead Score</th><th>CRM</th><th>Ação</th></tr></thead><tbody>{data.items.map((business: any) => <BusinessRow key={business.id} business={business} analyzingId={analyzingId} onAnalyze={analyze} />)}</tbody></table></div> : <Empty>Nenhuma empresa corresponde aos filtros.</Empty>}</section>
    <section className="card exportHistory"><h2 className="sectionTitle">Exportações persistentes</h2>{exports.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Arquivo</th><th>Formato</th><th>Linhas</th><th>Tamanho</th><th>Status</th><th>Criado</th><th>Ação</th></tr></thead><tbody>{exports.map(item => <tr key={item.id}><td>{item.filename}</td><td>{item.format}</td><td>{item.rowCount}</td><td>{size(item.sizeBytes)}</td><td><Status value={item.status} /></td><td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td>{item.status === 'COMPLETED' && <button className="btn secondary sm" onClick={() => download(`exports/${item.id}/download`, item.filename)}>Baixar novamente</button>}</td></tr>)}</tbody></table></div> : <Empty>Nenhuma exportação gerada.</Empty>}</section>
    {campaignMessage && <div className="toast">{campaignMessage}</div>}
  </Shell>;
}
