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

export default function Businesses() {
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [options, setOptions] = useState<any>({ locations: [], categories: [], siteStatuses: [], whatsappStatuses: [] });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [exports, setExports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState('');
  const [error, setError] = useState('');
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
  useEffect(() => { api('businesses/filter-options').then(setOptions); load(initialFilters); loadExports(); }, []);
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

  const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  return <Shell title="Empresas" subtitle={`${data.total ?? 0} empresas correspondem aos filtros`}>
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
    <div className="toolbar"><span className="spacer"/><button disabled={Boolean(exportBusy)} className="btn secondary" onClick={() => createExport('CSV')}>{exportBusy === 'CSV' ? 'Gerando CSV…' : 'Exportar CSV'}</button><button disabled={Boolean(exportBusy)} className="btn secondary" onClick={() => createExport('XLSX')}>{exportBusy === 'XLSX' ? 'Gerando XLSX…' : 'Exportar XLSX'}</button></div>
    <section className="card">{data.items.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Empresa</th><th>Categoria</th><th>Cidade</th><th>Telefone</th><th>WhatsApp</th><th>Site</th><th>Rating</th><th>Avaliações</th><th>Lead Score</th><th>CRM</th></tr></thead><tbody>{data.items.map((business: any) => <tr key={business.id}><td><b>{business.name}</b></td><td>{business.category}</td><td>{business.city}/{business.state}</td><td>{business.phone ?? '—'}</td><td>{business.phones?.[0]?.whatsappStatus ?? 'UNKNOWN'}</td><td><Status value={business.siteStatus}/></td><td>{business.rating ?? '—'}</td><td>{business.reviewsCount ?? 0}</td><td><b style={{ color: business.leadScore >= 60 ? 'var(--brand)' : 'inherit' }}>{business.leadScore}</b></td><td><Status value={business.leadStatus}/></td></tr>)}</tbody></table></div> : <Empty>Nenhuma empresa corresponde aos filtros.</Empty>}</section>
    <section className="card exportHistory"><h2 className="sectionTitle">Exportações persistentes</h2>{exports.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Arquivo</th><th>Formato</th><th>Linhas</th><th>Tamanho</th><th>Status</th><th>Criado</th><th>Ação</th></tr></thead><tbody>{exports.map(item => <tr key={item.id}><td>{item.filename}</td><td>{item.format}</td><td>{item.rowCount}</td><td>{size(item.sizeBytes)}</td><td><Status value={item.status} /></td><td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td>{item.status === 'COMPLETED' && <button className="btn secondary sm" onClick={() => download(`exports/${item.id}/download`, item.filename)}>Baixar novamente</button>}</td></tr>)}</tbody></table></div> : <Empty>Nenhuma exportação gerada.</Empty>}</section>
  </Shell>;
}
