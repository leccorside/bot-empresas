import { leadInsightSystemPrompt, segmentSuggestionSystemPrompt } from './openai.ts';
import type { LeadInsightInput, LeadInsightResult, SegmentFilters, SegmentSuggestion } from './openai.ts';

const GEMINI_MODEL_DEFAULT = 'gemini-2.0-flash';

export class GeminiInsightProvider {
  private readonly key: string | undefined;
  private readonly model: string;
  constructor(key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL ?? GEMINI_MODEL_DEFAULT) { this.key = key; this.model = model; }
  isConfigured() { return Boolean(this.key); }

  async generateLeadInsight(input: LeadInsightInput): Promise<LeadInsightResult> {
    if (!this.key) throw new Error('Chave do Gemini não configurada');
    const data = await this.generate(leadInsightSystemPrompt, JSON.stringify(input));
    return { summary: String(data.summary ?? '').trim(), suggestedPitch: String(data.suggestedPitch ?? '').trim(), model: this.model };
  }

  async suggestSegment(goal: string): Promise<SegmentSuggestion> {
    if (!this.key) throw new Error('Chave do Gemini não configurada');
    const data = await this.generate(segmentSuggestionSystemPrompt, goal);
    return { filters: (data.filters ?? {}) as SegmentFilters, explanation: String(data.explanation ?? '').trim() };
  }

  private async generate(system: string, user: string): Promise<any> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini respondeu ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Gemini não retornou conteúdo');
    return JSON.parse(content);
  }
}
