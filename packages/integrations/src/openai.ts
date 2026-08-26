export type LeadInsightInput = { name: string; category: string; city: string; state: string; siteStatus: string; hasWebsite: boolean; reviewsCount: number; rating: number | null; leadScore: number; technologies: string[] };
export type LeadInsightResult = { summary: string; suggestedPitch: string; model: string };
export type SegmentFilters = { city?: string; category?: string; hasWebsite?: boolean; siteStatus?: string; minScore?: number; maxScore?: number; minReviews?: number; maxReviews?: number };
export type SegmentSuggestion = { filters: SegmentFilters; explanation: string };

export const leadInsightSystemPrompt = 'Você é um analista de vendas B2B. Analise os dados fornecidos sobre uma empresa prospectada e responda SOMENTE em JSON com os campos "summary" (2-3 frases em português do Brasil sobre a oportunidade comercial) e "suggestedPitch" (1-2 frases de abordagem inicial personalizada, natural, sem soar genérica). Nunca invente dados que não foram fornecidos.';
export const segmentSuggestionSystemPrompt = 'Você ajuda a montar segmentos de prospecção B2B a partir de um objetivo em texto livre. Responda SOMENTE em JSON com "filters" (objeto usando apenas as chaves city, category, hasWebsite [booleano], siteStatus [um de NO_WEBSITE, POOR, AVERAGE, GOOD, UNKNOWN], minScore, maxScore, minReviews, maxReviews — omita as chaves que não se aplicam) e "explanation" (1 frase em português explicando o filtro). Nunca invente cidade ou categoria que não estejam implícitas no texto.';

const CHAT_MODEL = 'gpt-4o-mini';

export class OpenAiInsightProvider {
  private readonly key: string | undefined;
  constructor(key = process.env.OPENAI_API_KEY) { this.key = key; }
  isConfigured() { return Boolean(this.key); }

  async generateLeadInsight(input: LeadInsightInput): Promise<LeadInsightResult> {
    if (!this.key) throw new Error('Chave da OpenAI não configurada');
    const data = await this.chat(leadInsightSystemPrompt, JSON.stringify(input));
    return { summary: String(data.summary ?? '').trim(), suggestedPitch: String(data.suggestedPitch ?? '').trim(), model: CHAT_MODEL };
  }

  async suggestSegment(goal: string): Promise<SegmentSuggestion> {
    if (!this.key) throw new Error('Chave da OpenAI não configurada');
    const data = await this.chat(segmentSuggestionSystemPrompt, goal);
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
}
