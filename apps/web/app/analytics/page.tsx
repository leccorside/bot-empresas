'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, Shell } from '../../components/Shell';

const scoreLabels: Record<string, string> = { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto', VERY_HIGH: 'Muito alto' };
const siteLabels: Record<string, string> = { NO_WEBSITE: 'Sem site', POOR: 'Ruim', AVERAGE: 'Médio', GOOD: 'Bom', UNKNOWN: 'Desconhecido' };
const whatsappLabels: Record<string, string> = { UNKNOWN: 'Desconhecido', AVAILABLE: 'Disponível', NOT_AVAILABLE: 'Indisponível', INVALID: 'Inválido' };
const funnelOrder = ['NEW', 'QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL', 'CUSTOMER'];
const funnelExcluded = ['NOT_INTERESTED', 'DO_NOT_CONTACT'];
const funnelLabels: Record<string, string> = { NEW: 'Novo', QUALIFIED: 'Qualificado', CONTACT_PENDING: 'Contato pendente', CONTACTED: 'Contatado', REPLIED: 'Respondeu', INTERESTED: 'Interessado', MEETING: 'Reunião', PROPOSAL: 'Proposta', CUSTOMER: 'Cliente', NOT_INTERESTED: 'Sem interesse', DO_NOT_CONTACT: 'Não contatar' };

function Bars({ data, labels, order }: { data: Record<string, number>; labels?: Record<string, string>; order?: string[] }) {
  const keys = order ? order.filter(key => key in data) : Object.keys(data).sort((a, b) => (data[b] ?? 0) - (data[a] ?? 0));
  const max = Math.max(1, ...Object.values(data));
  if (!keys.length) return <Empty>Sem dados ainda.</Empty>;
  return <div className="barList">{keys.map(key => <div className="barRow" key={key}><span>{labels?.[key] ?? key}</span><div className="barTrack"><i style={{ width: `${((data[key] ?? 0) / max) * 100}%` }} /></div><b>{data[key] ?? 0}</b></div>)}</div>;
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  async function load(period = days) {
    try { setData(await api(`analytics?days=${period}`)); setError(''); }
    catch (reason: any) { setError(reason.message ?? 'Falha ao carregar analytics'); }
  }
  useEffect(() => { load(days); }, [days]);

  const growth = data?.growth ?? [];
  const growthMax = Math.max(1, ...growth.map((g: any) => g.count));

  return <Shell title="Analytics" subtitle="Tendências e composição da base prospectada" badges={<div className="toolbar" style={{ marginBottom: 0 }}>{[7, 30, 90, 180].map(option => <button key={option} className={`btn sm ${days === option ? '' : 'secondary'}`} onClick={() => setDays(option)}>{option}d</button>)}</div>}>
    {error && <div className="dashboardError" style={{ marginBottom: 12 }}>{error}</div>}
    <div className="grid dashboardMetrics">
      <div className="card"><div className="metricLabel">Total de empresas</div><div className="metricValue">{data?.totalBusinesses ?? '—'}</div><div className="metricHint">base completa</div></div>
      <div className="card"><div className="metricLabel">Novas no período</div><div className="metricValue">{growth.reduce((total: number, g: any) => total + g.count, 0)}</div><div className="metricHint">últimos {data?.days ?? days} dias</div></div>
      <div className="card"><div className="metricLabel">Oportunidades HIGH+</div><div className="metricValue">{(data?.scoreDistribution?.HIGH ?? 0) + (data?.scoreDistribution?.VERY_HIGH ?? 0)}</div><div className="metricHint">score alto ou muito alto</div></div>
      <div className="card"><div className="metricLabel">Clientes</div><div className="metricValue">{data?.leadFunnel?.CUSTOMER ?? 0}</div><div className="metricHint">fim do funil CRM</div></div>
    </div>

    <section className="card" style={{ marginBottom: 18 }}>
      <h2 className="sectionTitle">Crescimento de empresas descobertas</h2>
      {growth.length ? <><div className="growthChart">{growth.map((g: any) => <div key={g.date} title={`${g.date}: ${g.count}`} style={{ height: `${(g.count / growthMax) * 100}%` }} />)}</div><div className="growthAxis"><span>{growth[0]?.date}</span><span>{growth[growth.length - 1]?.date}</span></div></> : <Empty>Nenhuma empresa descoberta no período selecionado.</Empty>}
    </section>

    <div className="grid analyticsGrid" style={{ marginBottom: 18 }}>
      <section className="card"><h2 className="sectionTitle">Distribuição de Lead Score</h2><Bars data={data?.scoreDistribution ?? {}} labels={scoreLabels} order={['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']} /></section>
      <section className="card"><h2 className="sectionTitle">Funil CRM</h2><Bars data={data?.leadFunnel ?? {}} labels={funnelLabels} order={funnelOrder} />{(data?.leadFunnel?.NOT_INTERESTED || data?.leadFunnel?.DO_NOT_CONTACT) ? <div className="tableHint" style={{ marginTop: 10 }}>Fora do funil: {funnelExcluded.map(key => `${funnelLabels[key]} ${data?.leadFunnel?.[key] ?? 0}`).join(' · ')}</div> : null}</section>
      <section className="card"><h2 className="sectionTitle">Status do site</h2><Bars data={data?.websiteStatus ?? {}} labels={siteLabels} /></section>
      <section className="card"><h2 className="sectionTitle">Telefones por status de WhatsApp</h2><Bars data={data?.whatsappStatus ?? {}} labels={whatsappLabels} /></section>
    </div>

    <div className="grid dashboardTables">
      <section className="card"><h2 className="sectionTitle">Top categorias</h2>{data?.byCategory?.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Categoria</th><th>Empresas</th><th>Score médio</th></tr></thead><tbody>{data.byCategory.map((row: any) => <tr key={row.category}><td>{row.category}</td><td>{row.count}</td><td>{row.avgScore}</td></tr>)}</tbody></table></div> : <Empty>Sem dados ainda.</Empty>}</section>
      <section className="card"><h2 className="sectionTitle">Top cidades</h2>{data?.byCity?.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Cidade</th><th>Empresas</th><th>Score médio</th></tr></thead><tbody>{data.byCity.map((row: any) => <tr key={`${row.city}-${row.state}`}><td>{row.city}/{row.state}</td><td>{row.count}</td><td>{row.avgScore}</td></tr>)}</tbody></table></div> : <Empty>Sem dados ainda.</Empty>}</section>
    </div>
  </Shell>;
}
