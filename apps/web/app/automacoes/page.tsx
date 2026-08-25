'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, Shell, Status } from '../../components/Shell';

const types = [['ONCE', 'Uma vez'], ['DAILY', 'Diariamente'], ['WEEKLY', 'Semanalmente'], ['MONTHLY', 'Mensalmente'], ['SPECIFIC_DAYS', 'Dias específicos'], ['CRON', 'CRON personalizado']];
const weekdays = [['0', 'Dom'], ['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb']];
const initialForm = { name: '', country: 'Brasil', state: 'Goiás', city: '', category: 'Todos', scheduleType: 'ONCE', nextRunAt: '', timezone: 'America/Sao_Paulo', cronExpression: '', specificTime: '09:00', specificDays: ['1'], enabled: true };

function localDateTime(value?: string | null, timezone = 'America/Sao_Paulo') {
  if (!value) return '';
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour') === '24' ? '00' : part('hour')}:${part('minute')}`;
}

function dateTimeToUtc(value: string, timezone: string) {
  const target = new Date(`${value}:00.000Z`).getTime();
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute'), part('second'));
    instant += target - represented;
  }
  return new Date(instant).toISOString();
}

function cronDetails(expression?: string | null) {
  const parts = expression?.trim().split(/\s+/) ?? [];
  if (parts.length !== 5) return { specificTime: '09:00', specificDays: ['1'] };
  return { specificTime: `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`, specificDays: parts[4].split(',') };
}

export default function Automations() {
  const [items, setItems] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ automation: {} });
  const [form, setForm] = useState<any>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [schedules, config] = await Promise.all([api('schedules'), api('settings')]);
      setItems(schedules); setSettings(config); setError('');
    } catch (reason: any) { setError(reason.message); }
  }
  useEffect(() => { load(); }, []);

  function setField(field: string, value: any) { setForm((current: any) => ({ ...current, [field]: value })); }
  function reset() { setEditingId(null); setForm(initialForm); setError(''); }
  function edit(item: any) {
    const details = item.scheduleType === 'SPECIFIC_DAYS' ? cronDetails(item.cronExpression) : {};
    setEditingId(item.id);
    setForm({ ...initialForm, ...item, nextRunAt: localDateTime(item.nextRunAt, item.timezone), ...details });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toggleDay(day: string) {
    const selected = form.specificDays.includes(day) ? form.specificDays.filter((value: string) => value !== day) : [...form.specificDays, day];
    setField('specificDays', selected.sort());
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body: any = { name: form.name, country: form.country, state: form.state, city: form.city, category: form.category, scheduleType: form.scheduleType, timezone: form.timezone, enabled: editingId ? form.enabled : true };
      if (form.scheduleType === 'SPECIFIC_DAYS') {
        if (!form.specificDays.length) throw new Error('Selecione pelo menos um dia da semana.');
        const [hour, minute] = form.specificTime.split(':');
        body.cronExpression = `${Number(minute)} ${Number(hour)} * * ${form.specificDays.join(',')}`;
      } else if (form.scheduleType === 'CRON') body.cronExpression = form.cronExpression;
      else body.nextRunAt = dateTimeToUtc(form.nextRunAt, form.timezone);
      await api(editingId ? `schedules/${editingId}` : 'schedules', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      reset(); await load();
    } catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }
  async function toggle(item: any) {
    setBusy(true); setError('');
    try { await api(`schedules/${item.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !item.enabled }) }); await load(); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }
  async function remove(item: any) {
    if (!confirm(`Excluir o agendamento “${item.name}”?`)) return;
    setBusy(true); setError('');
    try { await api(`schedules/${item.id}`, { method: 'DELETE' }); if (editingId === item.id) reset(); await load(); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }
  async function emergency(action: string) {
    setBusy(true);
    try { await api(`settings/emergency/${action}`, { method: 'POST' }); await load(); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }

  return <Shell title="Automações" subtitle="Agendamentos persistidos e executados automaticamente" badges={<span className={`badge ${settings.automation?.paused ? 'red' : 'green'}`}>{settings.automation?.paused ? 'AUTOMAÇÕES PARADAS' : 'AUTOMAÇÕES ATIVAS'}</span>}>
    <div className="toolbar"><button disabled={busy} className={`btn ${settings.automation?.paused ? '' : 'danger'}`} onClick={() => emergency(settings.automation?.paused ? 'resume' : 'stop')}>{settings.automation?.paused ? 'Retomar automações' : 'Parar automações'}</button><button disabled={busy} className="btn secondary" onClick={() => emergency(settings.automation?.autopilot ? 'autopilot-off' : 'autopilot-on')}>Autopilot {settings.automation?.autopilot ? 'ON' : 'OFF'}</button></div>
    <section className="card scheduleCard">
      <div className="filtersHeader"><h2 className="sectionTitle">{editingId ? 'Editar agendamento' : 'Novo agendamento'}</h2>{error && <span className="filterError">{error}</span>}</div>
      <form className="scheduleForm" onSubmit={submit}>
        <label className="field"><span>Nome</span><input className="input" value={form.name} onChange={e => setField('name', e.target.value)} required /></label>
        <label className="field"><span>Estado</span><input className="input" value={form.state} onChange={e => setField('state', e.target.value)} required /></label>
        <label className="field"><span>Cidade</span><input className="input" value={form.city} onChange={e => setField('city', e.target.value)} required /></label>
        <label className="field"><span>Categoria</span><input className="input" value={form.category} onChange={e => setField('category', e.target.value)} placeholder="Todos, Hotéis, Restaurantes..." required /></label>
        <label className="field"><span>Frequência</span><select className="input" value={form.scheduleType} onChange={e => setField('scheduleType', e.target.value)}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Fuso horário</span><input className="input" value={form.timezone} onChange={e => setField('timezone', e.target.value)} required /></label>
        {!['CRON', 'SPECIFIC_DAYS'].includes(form.scheduleType) && <label className="field"><span>{form.scheduleType === 'ONCE' ? 'Executar em' : 'Primeira execução / horário'}</span><input className="input" type="datetime-local" value={form.nextRunAt} onChange={e => setField('nextRunAt', e.target.value)} required /></label>}
        {form.scheduleType === 'CRON' && <label className="field"><span>Expressão CRON (min hora dia mês semana)</span><input className="input" value={form.cronExpression} onChange={e => setField('cronExpression', e.target.value)} placeholder="0 9 * * 1-5" required /></label>}
        {form.scheduleType === 'SPECIFIC_DAYS' && <><label className="field"><span>Horário</span><input className="input" type="time" value={form.specificTime} onChange={e => setField('specificTime', e.target.value)} required /></label><div className="field scheduleDays"><span>Dias da semana</span><div>{weekdays.map(([value, label]) => <label key={value}><input type="checkbox" checked={form.specificDays.includes(value)} onChange={() => toggleDay(value)} /> {label}</label>)}</div></div></>}
        <div className="scheduleActions"><button className="btn" disabled={busy}>{editingId ? 'Salvar alterações' : 'Agendar'}</button>{editingId && <button type="button" className="btn secondary" onClick={reset}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="card tableWrap">{items.length ? <table className="table"><thead><tr><th>Nome</th><th>Destino</th><th>Categoria</th><th>Frequência</th><th>Última execução</th><th>Próxima execução</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.name}<div className="tableHint">{item.timezone}</div></td><td>{item.city}/{item.state}</td><td>{item.category}</td><td>{types.find(([value]) => value === item.scheduleType)?.[1]}{item.cronExpression && <div className="tableHint">{item.cronExpression}</div>}</td><td>{item.lastRunAt ? new Date(item.lastRunAt).toLocaleString('pt-BR') : '—'}</td><td>{item.nextRunAt ? new Date(item.nextRunAt).toLocaleString('pt-BR') : '—'}</td><td><Status value={item.enabled ? 'ONLINE' : 'PAUSED'} /></td><td><div className="rowActions"><button className="btn secondary sm" onClick={() => edit(item)}>Editar</button><button disabled={busy} className="btn secondary sm" onClick={() => toggle(item)}>{item.enabled ? 'Pausar' : 'Ativar'}</button><button disabled={busy} className="btn danger sm" onClick={() => remove(item)}>Excluir</button></div></td></tr>)}</tbody></table> : <Empty>Nenhuma automação configurada.</Empty>}</section>
  </Shell>;
}
