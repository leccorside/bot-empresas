export type PageSpeedResult = { performanceScore: number | null };

export class PageSpeedProvider {
  private readonly key: string | undefined;
  constructor(key = process.env.PAGESPEED_API_KEY) { this.key = key; }

  async analyze(url: string): Promise<PageSpeedResult> {
    if (!this.key) return this.demo(url);
    const timeoutMs = Math.max(1_000, Number(process.env.PAGESPEED_TIMEOUT_MS ?? 20_000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
      endpoint.searchParams.set('url', url);
      endpoint.searchParams.set('key', this.key);
      endpoint.searchParams.set('strategy', process.env.PAGESPEED_STRATEGY ?? 'mobile');
      endpoint.searchParams.set('category', 'performance');
      const response = await fetch(endpoint.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error(`PageSpeed respondeu ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      const score = data.lighthouseResult?.categories?.performance?.score;
      return { performanceScore: typeof score === 'number' ? Math.round(score * 100) : null };
    } finally { clearTimeout(timeout); }
  }

  private demo(url: string): PageSpeedResult {
    const hash = [...url].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 11);
    return { performanceScore: hash % 100 };
  }
}
