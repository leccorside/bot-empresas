import { createHmac, timingSafeEqual } from 'crypto';
import { normalizeText } from '@prospector/shared';
import type { GeographicBounds } from '@prospector/shared';
export * from './website.ts';
export * from './pagespeed.ts';

export type DiscoveredBusiness = { provider: string; providerId: string; name: string; category: string; address?: string; city: string; state: string; country: string; latitude?: number; longitude?: number; website?: string; phone?: string; rating?: number; reviewsCount?: number; mapsUrl?: string };
export type BusinessDiscoveryInput = { country: string; state: string; city: string; category: string; pageToken?: string; bounds?: GeographicBounds };
export type LocationInput = { country: string; state: string; city: string };
export interface BusinessDiscoveryProvider {
  resolveBoundary(input: LocationInput): Promise<GeographicBounds>;
  discover(input: BusinessDiscoveryInput): Promise<{ results: DiscoveredBusiness[]; nextPageToken?: string }>;
}

export class GooglePlacesProvider implements BusinessDiscoveryProvider {
  private readonly key: string | undefined;
  constructor(key = process.env.GOOGLE_MAPS_API_KEY) { this.key = key; }
  private async request(body: Record<string, unknown>, fieldMask: string) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type':'application/json', 'X-Goog-Api-Key': this.key!, 'X-Goog-FieldMask':fieldMask }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Google Places respondeu ${response.status}: ${await response.text()}`);
    return response.json() as Promise<any>;
  }
  async resolveBoundary(input: LocationInput): Promise<GeographicBounds> {
    if (!this.key) return this.demoBoundary(input);
    const data = await this.request(
      { textQuery:`${input.city}, ${input.state}, ${input.country}`, languageCode:'pt-BR', regionCode:'BR', pageSize:5 },
      'places.id,places.displayName,places.location,places.viewport,places.types'
    );
    const place = (data.places ?? []).find((candidate:any) => candidate.viewport?.low && candidate.viewport?.high && (candidate.types ?? []).some((type:string) => ['locality','administrative_area_level_2','administrative_area_level_3'].includes(type)))
      ?? (data.places ?? []).find((candidate:any) => candidate.viewport?.low && candidate.viewport?.high);
    if (!place) throw new Error(`Google Places não retornou limites geográficos para ${input.city}/${input.state}`);
    return { south:Number(place.viewport.low.latitude), north:Number(place.viewport.high.latitude), west:Number(place.viewport.low.longitude), east:Number(place.viewport.high.longitude) };
  }
  async discover(input: BusinessDiscoveryInput): Promise<{ results: DiscoveredBusiness[]; nextPageToken?: string }> {
    if (!this.key) return this.demo(input);
    const query = input.bounds ? (input.category === 'Todos' ? 'empresas' : input.category) : `${input.category === 'Todos' ? 'empresas' : input.category} em ${input.city}, ${input.state}, ${input.country}`;
    const locationRestriction = input.bounds ? { rectangle:{ low:{latitude:input.bounds.south,longitude:input.bounds.west}, high:{latitude:input.bounds.north,longitude:input.bounds.east} } } : undefined;
    const data = await this.request(
      { textQuery:query, pageToken:input.pageToken, languageCode:'pt-BR', regionCode:'BR', pageSize:20, locationRestriction },
      'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,nextPageToken'
    );
    return { results: (data.places ?? []).map((p:any) => ({ provider:'GOOGLE', providerId:p.id, name:p.displayName?.text ?? 'Sem nome', category:input.category, address:p.formattedAddress, city:input.city, state:input.state, country:input.country, latitude:p.location?.latitude, longitude:p.location?.longitude, website:p.websiteUri, phone:p.nationalPhoneNumber, rating:p.rating, reviewsCount:p.userRatingCount, mapsUrl:p.googleMapsUri })), nextPageToken:data.nextPageToken };
  }
  private demoBoundary(input: LocationInput): GeographicBounds {
    const hash = [...`${input.city}|${input.state}|${input.country}`].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
    const latitude = -30 + (hash % 2_000) / 100;
    const longitude = -60 + (Math.floor(hash / 2_000) % 2_000) / 100;
    return { south:latitude - 0.03, north:latitude + 0.03, west:longitude - 0.03, east:longitude + 0.03 };
  }
  private async demo(input: BusinessDiscoveryInput): Promise<{ results: DiscoveredBusiness[]; nextPageToken?: string }> {
    if (input.pageToken) return { results: [], nextPageToken: undefined };
    const seed = `${input.city}-${input.category}`.toLowerCase().replace(/\s/g,'-');
    const categories = input.category === 'Todos' ? ['Restaurante','Academia','Clínica','Hotel','Imobiliária'] : [input.category];
    return { results: categories.flatMap((category, i) => Array.from({length:3},(_,j) => ({ provider:'DEMO', providerId:`${seed}-${i}-${j}`, name:`${category} ${['Central','Primavera','Imperial'][j]}`, category, address:`Avenida Principal, ${100+i*10+j} - Centro`, city:input.city, state:input.state, country:input.country, phone:`(64) 99${i}${j}0-10${j}${i}`, rating: j === 0 ? 4.7 : 3.5+j/10, reviewsCount:j*18+i, mapsUrl:'https://maps.google.com' }))), nextPageToken: undefined };
  }
}

export interface MessagingProvider { send(input:{to:string; body:string; idempotencyKey:string}):Promise<{providerMessageId:string}> }
export class WhatsAppCloudProvider implements MessagingProvider {
  async send(input:{to:string;body:string;idempotencyKey:string}) {
    if (process.env.DRY_RUN !== 'false') return { providerMessageId:`dry-run:${input.idempotencyKey}` };
    const token=process.env.WHATSAPP_ACCESS_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
    if(!token || !phoneId) throw new Error('Credenciais WhatsApp não configuradas');
    const response=await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:input.to,type:'text',text:{body:input.body}})});
    if(!response.ok) throw new Error(`WhatsApp respondeu ${response.status}`);
    const data=await response.json() as any; return {providerMessageId:data.messages?.[0]?.id};
  }
}

export function verifyWhatsAppWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string | undefined) {
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const provided = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return false;
  return timingSafeEqual(provided, expectedBuffer);
}

const optOutKeywords = ['parar', 'pare', 'para de mandar', 'sair', 'saia', 'remover', 'remova', 'me remova', 'cancelar', 'cancele', 'nao quero', 'sem interesse', 'nao tenho interesse', 'descadastrar', 'descadastre', 'stop', 'unsubscribe'];
export function detectOptOutIntent(text: string) {
  const normalized = normalizeText(text ?? '');
  return optOutKeywords.some(keyword => normalized.includes(keyword));
}
