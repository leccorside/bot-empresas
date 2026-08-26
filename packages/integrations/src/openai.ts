import { normalizeText } from '@prospector/shared';

export type LeadInsightInput = { name: string; category: string; city: string; state: string; siteStatus: string; hasWebsite: boolean; reviewsCount: number; rating: number | null; leadScore: number; technologies: string[] };
export type LeadInsightResult = { summary: string; suggestedPitch: string; model: string };
export type SegmentFilters = { city?: string; category?: string; hasWebsite?: boolean; siteStatus?: string; minScore?: number; maxScore?: number; minReviews?: number; maxReviews?: number };
export type SegmentSuggestion = { filters: SegmentFilters; explanation: string };

const CHAT_MODEL = 'gpt-4o-mini';

export class OpenAiInsightProvider {
  private readonly key: string | undefined;
  constructor(key = process.env.OPENAI_API_KEY) { this.key = key; }

  async generateLeadInsight(input: LeadInsightInput): Promise<LeadInsightResult> {
    if (!this.key) return this.demoInsight(input);
    const system = 'Você é um analista de vendas B2B. Analise os dados fornecidos sobre uma empresa prospectada e responda SOMENTE em JSON com os campos "summary" (2-3 frases em português do Brasil sobre a oportunidade comercial) e "suggestedPitch" (1-2 frases de abordagem inicial personalizada, natural, sem soar genérica). Nunca invente dados que não foram fornecidos.';
    const data = await this.chat(system, JSON.stringify(input));
    return { summary: String(data.summary ?? '').trim(), suggestedPitch: String(data.suggestedPitch ?? '').trim(), model: CHAT_MODEL };
  }

  async suggestSegment(goal: string): Promise<SegmentSuggestion> {
    if (!this.key) return this.demoSegment(goal);
    const system = 'Você ajuda a montar segmentos de prospecção B2B a partir de um objetivo em texto livre. Responda SOMENTE em JSON com "filters" (objeto usando apenas as chaves city, category, hasWebsite [booleano], siteStatus [um de NO_WEBSITE, POOR, AVERAGE, GOOD, UNKNOWN], minScore, maxScore, minReviews, maxReviews — omita as chaves que não se aplicam) e "explanation" (1 frase em português explicando o filtro). Nunca invente cidade ou categoria que não estejam implícitas no texto.';
    const data = await this.chat(system, goal);
    return { filters: (data.filters ?? {}) as SegmentFilters, explanation: String(data.explanation ?? '').trim() };
  }

  private async chat(system: string, user: string): Promise<any> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, response_format: { type: 'json_object' }, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!response.ok) throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI não retornou conteúdo');
    return JSON.parse(content);
  }

  private demoInsight(input: LeadInsightInput): LeadInsightResult {
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
    return { summary, suggestedPitch, model: 'demo' };
  }

  private demoSegment(goal: string): SegmentSuggestion {
    const normalized = normalizeText(goal ?? '');
    const filters: SegmentFilters = {};
    if (/\bsem site\b|\bsem website\b|\bnao tem site\b/.test(normalized)) filters.hasWebsite = false;
    if (/site ruim|site lento|site precario|pessimo site/.test(normalized)) filters.siteStatus = 'POOR';
    if (/sem avaliac|poucas avaliac|sem review/.test(normalized)) filters.maxReviews = 10;
    if (/score alto|lead quente|melhores oportunidades/.test(normalized)) filters.minScore = 60;
    const explanation = Object.keys(filters).length
      ? 'Filtro sugerido (modo demo) a partir de palavras-chave reconhecidas no objetivo.'
      : 'Não foi possível reconhecer critérios específicos no objetivo (modo demo); refine o texto ou configure OPENAI_API_KEY para sugestões mais precisas.';
    return { filters, explanation };
  }
}
