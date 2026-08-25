import { createHash } from 'crypto';
import { isIP } from 'net';
import { lookup } from 'dns/promises';

export type WebsiteStatus = 'NO_WEBSITE' | 'POOR' | 'AVERAGE' | 'GOOD' | 'UNKNOWN';
export type WebsiteAnalysisResult = {
  requestedUrl: string;
  finalUrl: string;
  status: WebsiteStatus;
  httpStatus: number;
  responseMs: number;
  hasHttps: boolean;
  sslValid: boolean;
  hasViewport: boolean;
  title: string | null;
  description: string | null;
  isWordPress: boolean;
  technologies: string[];
};

export type WebsiteAnalyzerOptions = {
  fetcher?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

const decode = (value: string) => value
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();

export function normalizeWebsiteUrl(value: string) {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Apenas URLs HTTP ou HTTPS podem ser analisadas');
  if (url.username || url.password) throw new Error('URL com credenciais não permitida');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Porta não permitida para análise');
  url.hash = '';
  return url.toString();
}

export function websiteAnalysisVersion(url: string, analyzerVersion = process.env.WEBSITE_ANALYZER_VERSION ?? 'v1') {
  return `${analyzerVersion}:${createHash('sha256').update(normalizeWebsiteUrl(url)).digest('hex').slice(0, 20)}`;
}

function privateIpv4(address: string) {
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 4) return privateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized.startsWith('::ffff:')) return !normalized.slice(7).includes('.') || privateIpv4(normalized.slice(7));
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff');
}

async function defaultResolveHost(hostname: string) {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true, verbatim: true })).map(result => result.address);
}

async function assertPublicUrl(value: string, resolveHost: (hostname: string) => Promise<string[]>) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Destino local não permitido');
  const addresses = await resolveHost(hostname);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('Destino privado ou não resolvido não permitido');
}

async function limitedText(response: Response, maxBytes: number) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0, output = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error(`Página excede o limite de ${maxBytes} bytes`);
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally { reader.releaseLock(); }
}

function metaContent(html: string, key: 'description' | 'viewport') {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '']));
    if ((attributes.name ?? '').toLowerCase() === key) return decode(attributes.content ?? '');
  }
  return null;
}

export function detectTechnologies(html: string, headers: Headers) {
  const source = html.toLowerCase(), technologies = new Set<string>();
  const signals: Array<[string, boolean]> = [
    ['WordPress', /wp-content|wp-includes|wordpress/.test(source)], ['Wix', /wixstatic\.com|wix-code/.test(source)],
    ['Shopify', /cdn\.shopify\.com|shopify\.theme/.test(source)], ['Joomla', /\/media\/system\/js\/|joomla!/.test(source)],
    ['Drupal', /drupalsettings|sites\/default\/files/.test(source)], ['Next.js', /_next\/static|__next_data__/.test(source)],
    ['React', /data-reactroot|react-dom/.test(source)], ['Vue.js', /data-v-|vue(?:\.runtime)?\.min\.js/.test(source)],
    ['Angular', /ng-version|angular(?:\.min)?\.js/.test(source)], ['Bootstrap', /bootstrap(?:\.min)?\.(?:css|js)/.test(source)],
    ['jQuery', /jquery(?:-|\.)(?:min\.)?js/.test(source)], ['Google Analytics', /google-analytics\.com|gtag\(/.test(source)],
    ['Google Tag Manager', /googletagmanager\.com/.test(source)], ['Cloudflare', /cloudflare/.test((headers.get('server') ?? '').toLowerCase())],
  ];
  signals.forEach(([name, found]) => { if (found) technologies.add(name); });
  const poweredBy = headers.get('x-powered-by');
  if (poweredBy) technologies.add(poweredBy.slice(0, 80));
  return [...technologies].sort();
}

export function classifyWebsite(input: { httpStatus: number; responseMs: number; hasHttps: boolean; sslValid: boolean; hasViewport: boolean; title: string | null; description: string | null }): WebsiteStatus {
  if (input.httpStatus < 200 || input.httpStatus >= 400) return 'POOR';
  let quality = 30;
  if (input.hasHttps && input.sslValid) quality += 20;
  if (input.hasViewport) quality += 15;
  if (input.title) quality += 10;
  if (input.description) quality += 10;
  quality += input.responseMs <= 2_000 ? 15 : input.responseMs <= 4_000 ? 8 : 0;
  return quality >= 75 ? 'GOOD' : quality >= 45 ? 'AVERAGE' : 'POOR';
}

export async function analyzeWebsite(rawUrl: string, options: WebsiteAnalyzerOptions = {}): Promise<WebsiteAnalysisResult> {
  const requestedUrl = normalizeWebsiteUrl(rawUrl);
  const fetcher = options.fetcher ?? fetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? Number(process.env.WEBSITE_ANALYZER_TIMEOUT_MS ?? 10_000));
  const maxBytes = Math.max(10_000, options.maxBytes ?? Number(process.env.WEBSITE_ANALYZER_MAX_BYTES ?? 1_000_000));
  const maxRedirects = Math.max(0, options.maxRedirects ?? Number(process.env.WEBSITE_ANALYZER_MAX_REDIRECTS ?? 5));
  const started = Date.now();
  let currentUrl = requestedUrl, response: Response | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      await assertPublicUrl(currentUrl, resolveHost);
      response = await fetcher(currentUrl, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'LocalProspector-WebsiteAnalyzer/1.0', Accept: 'text/html,application/xhtml+xml' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location) break;
      if (redirects === maxRedirects) throw new Error('Limite de redirecionamentos excedido');
      currentUrl = normalizeWebsiteUrl(new URL(location, currentUrl).toString());
    }
    if (!response) throw new Error('Website não respondeu');
    const html = await limitedText(response, maxBytes);
    const responseMs = Date.now() - started;
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decode(titleMatch[1].replace(/<[^>]+>/g, '')) || null : null;
    const description = metaContent(html, 'description') || null;
    const hasViewport = Boolean(metaContent(html, 'viewport'));
    const technologies = detectTechnologies(html, response.headers);
    const hasHttps = new URL(currentUrl).protocol === 'https:';
    const sslValid = hasHttps;
    return { requestedUrl, finalUrl: currentUrl, httpStatus: response.status, responseMs, hasHttps, sslValid, hasViewport, title, description, isWordPress: technologies.includes('WordPress'), technologies, status: classifyWebsite({ httpStatus: response.status, responseMs, hasHttps, sslValid, hasViewport, title, description }) };
  } finally { clearTimeout(timeout); }
}
