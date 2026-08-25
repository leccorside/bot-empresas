'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Empty, Shell, Status } from '../components/Shell';

const services = [['API', 'api'], ['POSTGRES', 'database'], ['REDIS', 'redis'], ['WORKER', 'worker'], ['SCHEDULER', 'scheduler'], ['RECOVERY', 'recovery'], ['RECONCILIATION', 'reconciliation']];

function formatBytes(bytes?: number) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function duration(start?: string | null, end?: string | null) {
  if (!start) return '—';
  const milliseconds = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function Dashboard() {
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try { setData(await api('dashboard')); setError(''); }
    catch (reason: any) { setError(reason.message ?? 'Falha ao consultar o estado operacional'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); const timer = setInterval(load, 10_000); return () => clearInterval(timer); }, []);

  const metrics = data?.metrics ?? {};
  const cards = [
    ['Empresas', metrics.businesses, 'total persistido'], ['Com site', metrics.withWebsite, `${metrics.withoutWebsite ?? 0} sem site`],
    ['Com telefone', metrics.withPhone, `${metrics.withoutPhone ?? 0} sem telefone`], ['WhatsApp confirmado', metrics.whatsapp, 'empresas confirmadas'],
    ['Sem avaliações', metrics.noReviews, 'oportunidade comercial'], ['Oportunidades HIGH', metrics.high, 'score igual ou acima de 60'],
    ['Jobs esperando', data?.queues?.total?.waiting, `${data?.queues?.total?.delayed ?? 0} com delay`], ['Jobs falhos', data?.queues?.total?.failed, `${data?.queues?.total?.active ?? 0} ativos`],
  ];
  const totalStatus = data && Object.values(data.services ?? {}).every(status => status === 'ONLINE') ? 'ONLINE' : loading ? 'CHECKING' : 'DEGRADED';

  return <Shell title="Dashboard operacional" subtitle="PostgreSQL como fonte de verdade e BullMQ como mecanismo de execução" badges={<>
    <Status value={totalStatus} />
    <span className={`badge ${data?.settings?.dryRun ? 'yellow' : 'green'}`}>{data?.settings?.dryRun ? 'DRY RUN ATIVO' : 'ENVIO REAL'}</span>
    <span className={`badge ${data?.settings?.autopilot ? 'green' : ''}`}>AUTOPILOT {data?.settings?.autopilot ? 'ON' : 'OFF'}</span>
  </>}>
    <div className="dashboardToolbar"><span className={error ? 'dashboardError' : 'sub'}>{error || (data?.healthCheckedAt ? `Atualizado em ${new Date(data.healthCheckedAt).toLocaleString('pt-BR')}` : 'Carregando métricas…')}</span><button className="btn secondary sm" disabled={loading} onClick={() => { setLoading(true); load(); }}>{loading ? 'Atualizando…' : 'Atualizar agora'}</button></div>

    <div className="grid dashboardMetrics">{cards.map(([label, value, hint]) => <div className="card" key={String(label)}><div className="metricLabel">{label}</div><div className="metricValue">{value ?? '—'}</div><div className="metricHint">{hint}</div></div>)}</div>

    <div className="grid operationalGrid">
      <section className="card"><h2 className="sectionTitle">Saúde dos serviços</h2><div className="health">{services.map(([label, key]) => <div className="healthRow" key={key}><span>{label}</span><span className="healthDetail">{key === 'database' && `${data?.latencyMs?.database ?? '—'} ms `}{key === 'redis' && `${data?.latencyMs?.redis ?? '—'} ms `}<Status value={data?.services?.[key] ?? 'CHECKING'} /></span></div>)}</div></section>
      <section className="card"><h2 className="sectionTitle">Filas BullMQ em tempo real</h2><table className="table compactTable"><thead><tr><th>Fila</th><th>Espera</th><th>Ativos</th><th>Delay</th><th>Falhos</th></tr></thead><tbody>{[['Prospecção', data?.queues?.prospecting], ['Campanhas', data?.queues?.campaigns]].map(([label, queue]: any) => <tr key={label}><td>{label}</td><td>{queue?.waiting ?? '—'}</td><td>{queue?.active ?? '—'}</td><td>{queue?.delayed ?? '—'}</td><td>{queue?.failed ?? '—'}</td></tr>)}</tbody></table><div className="durableJobs"><span>Estado durável</span><span>WAITING <b>{data?.jobs?.WAITING ?? 0}</b></span><span>ACTIVE <b>{data?.jobs?.ACTIVE ?? 0}</b></span><span>FAILED <b>{data?.jobs?.FAILED ?? 0}</b></span></div></section>
      <section className="card"><h2 className="sectionTitle">Armazenamento persistente</h2><div className="storageMetrics"><div><span>PostgreSQL</span><b>{formatBytes(data?.storage?.databaseBytes)}</b></div><div><span>Exportações</span><b>{formatBytes(data?.storage?.exportsBytes)}</b><small>{data?.storage?.exportFiles ?? 0} arquivos catalogados</small></div><div><span>Logs</span><b>{formatBytes(data?.storage?.logsBytes)}</b></div><div><span>Uptime da API</span><b>{duration(new Date(Date.now() - (data?.uptimeSeconds ?? 0) * 1000).toISOString(), new Date().toISOString())}</b></div></div></section>
    </div>

    <div className="grid dashboardTables">
      <section className="card"><h2 className="sectionTitle">Últimas execuções</h2>{data?.runs?.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Destino</th><th>Categoria</th><th>Etapa</th><th>Status</th><th>Encontradas</th><th>Novas</th><th>Duração</th></tr></thead><tbody>{data.runs.map((run: any) => <tr key={run.id}><td>{run.city}/{run.state}</td><td>{run.category}</td><td>{run.currentStage}</td><td><Status value={run.status} /></td><td>{run.businessesFound}</td><td>{run.businessesNew}</td><td>{duration(run.startedAt, run.finishedAt)}</td></tr>)}</tbody></table></div> : <Empty>Nenhuma execução registrada.</Empty>}</section>
      <section className="card"><h2 className="sectionTitle">Próximas execuções</h2>{data?.schedules?.length ? <div className="tableWrap"><table className="table"><thead><tr><th>Automação</th><th>Destino</th><th>Categoria</th><th>Frequência</th><th>Próxima execução</th></tr></thead><tbody>{data.schedules.map((schedule: any) => <tr key={schedule.id}><td>{schedule.name}</td><td>{schedule.city}/{schedule.state}</td><td>{schedule.category}</td><td>{schedule.scheduleType}</td><td>{new Date(schedule.nextRunAt).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div> : <Empty>Nenhuma execução futura agendada.</Empty>}</section>
    </div>
  </Shell>;
}
