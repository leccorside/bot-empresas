import { normalizeText } from '@prospector/shared';
import { GeminiInsightProvider } from './gemini.ts';
import { OpenAiInsightProvider } from './openai.ts';
import type { LeadInsightInput, LeadInsightResult, SegmentFilters, SegmentSuggestion } from './openai.ts';

export function demoLeadInsight(input: LeadInsightInput): LeadInsightResult {
  const points: string[] = [];
  if (!input.hasWebsite) points.push('não possui site próprio, perdendo visibilidade para concorrentes que já vendem online');
  else if (input.siteStatus === 'POOR') points.push('o site atual apresenta problemas técnicos que afastam clientes (lento, sem HTTPS ou não responsivo)');
  if ((input.reviewsCount ?? 0) === 0) points.push('ainda não tem avaliações no Google, o que reduz a confiança de novos clientes');
  else if ((input.reviewsCount ?? 0) <= 10) points.push('tem poucas avaliações, um sinal de oportunidade para reforçar a reputação online');
  if (!points.length) points.push('já tem presença digital razoável, mas pode se beneficiar de melhorias pontuais');
  const summary = `${input.name} (${input.category}, ${input.city}/${input.state}) ${points.join('; ')}.`;
  const suggestedPitch = !input.hasWebsite
    ? `Olá! Notei que a ${input.name} ainda não tem um site — muitos clientes de ${input.category.toLowerCase()} em ${input.city} já buscam online antes de decidir. Posso te mostrar como resolver isso rapidamente?`
    : `Olá! Analisando negócios de ${input.category.toLowerCase()} em ${input.city}, vi uma oportunidade de fortalecer a presença digital da ${input.name}. Tem 5 minutos para eu te mostrar?`;
  const reasons: string[] = [];
  let adjustment = 0;
  if (!input.hasWebsite) { adjustment += 15; reasons.push('ausência de site'); }
  if ((input.reviewsCount ?? 0) === 0) { adjustment += 10; reasons.push('nenhuma avaliação no Google'); }
  if (input.rating != null && input.rating < 3) { adjustment += 10; reasons.push('avaliação média baixa'); }
  const suggestedScore = Math.max(0, Math.min(100, input.leadScore + adjustment));
  const scoreJustification = reasons.length
    ? `Modo demo: ajuste de +${adjustment} sugerido por ${reasons.join(', ')}.`
    : 'Modo demo: score atual já reflete bem os sinais coletados, sem ajuste sugerido.';
  return { summary, suggestedPitch, model: 'demo', suggestedScore, scoreJustification };
}

export function demoSegmentSuggestion(goal: string): SegmentSuggestion {
  const normalized = normalizeText(goal ?? '');
  const filters: SegmentFilters = {};
  if (/\bsem site\b|\bsem website\b|\bnao tem site\b/.test(normalized)) filters.hasWebsite = false;
  if (/site ruim|site lento|site precario|pessimo site/.test(normalized)) filters.siteStatus = 'POOR';
  if (/sem avaliac|poucas avaliac|sem review/.test(normalized)) filters.maxReviews = 10;
  if (/score alto|lead quente|melhores oportunidades/.test(normalized)) filters.minScore = 60;
  const explanation = Object.keys(filters).length
    ? 'Filtro sugerido (modo demo) a partir de palavras-chave reconhecidas no objetivo.'
    : 'Não foi possível reconhecer critérios específicos no objetivo (modo demo); refine o texto ou configure GEMINI_API_KEY/OPENAI_API_KEY para sugestões mais precisas.';
  return { filters, explanation };
}

/**
 * Orquestra múltiplos provedores de IA numa cadeia de custo crescente: tenta o Gemini
 * primeiro (tier gratuito generoso), cai para a OpenAI só se o Gemini estiver ausente ou
 * falhar, e só usa o modo demo determinístico quando nenhum provedor real está configurado —
 * assim economiza tokens pagos da OpenAI sem nunca mascarar silenciosamente um erro real.
 */
export class AiInsightProvider {
  private readonly gemini: GeminiInsightProvider;
  private readonly openai: OpenAiInsightProvider;
  constructor(gemini: GeminiInsightProvider = new GeminiInsightProvider(), openai: OpenAiInsightProvider = new OpenAiInsightProvider()) {
    this.gemini = gemini;
    this.openai = openai;
  }

  async generateLeadInsight(input: LeadInsightInput): Promise<LeadInsightResult> {
    if (this.gemini.isConfigured()) {
      try { return await this.gemini.generateLeadInsight(input); }
      catch (error) { if (!this.openai.isConfigured()) throw error; }
    }
    if (this.openai.isConfigured()) return this.openai.generateLeadInsight(input);
    return demoLeadInsight(input);
  }

  async suggestSegment(goal: string): Promise<SegmentSuggestion> {
    if (this.gemini.isConfigured()) {
      try { return await this.gemini.suggestSegment(goal); }
      catch (error) { if (!this.openai.isConfigured()) throw error; }
    }
    if (this.openai.isConfigured()) return this.openai.suggestSegment(goal);
    return demoSegmentSuggestion(goal);
  }
}
