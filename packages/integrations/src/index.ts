export type DiscoveredBusiness = { provider: string; providerId: string; name: string; category: string; address?: string; city: string; state: string; country: string; latitude?: number; longitude?: number; website?: string; phone?: string; rating?: number; reviewsCount?: number; mapsUrl?: string };
export interface BusinessDiscoveryProvider { discover(input: { country: string; state: string; city: string; category: string; pageToken?: string }): Promise<{ results: DiscoveredBusiness[]; nextPageToken?: string }> }

export class GooglePlacesProvider implements BusinessDiscoveryProvider {
  private readonly key: string | undefined;
  constructor(key = process.env.GOOGLE_MAPS_API_KEY) { this.key = key; }
  async discover(input: { country: string; state: string; city: string; category: string; pageToken?: string }): Promise<{ results: DiscoveredBusiness[]; nextPageToken?: string }> {
    if (!this.key) return this.demo(input);
    const query = `${input.category === 'Todos' ? 'empresas' : input.category} em ${input.city}, ${input.state}, ${input.country}`;
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type':'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,nextPageToken' }, body: JSON.stringify({ textQuery: query, pageToken: input.pageToken, languageCode:'pt-BR', regionCode:'BR', pageSize:20 }) });
    if (!response.ok) throw new Error(`Google Places respondeu ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return { results: (data.places ?? []).map((p:any) => ({ provider:'GOOGLE', providerId:p.id, name:p.displayName?.text ?? 'Sem nome', category:input.category, address:p.formattedAddress, city:input.city, state:input.state, country:input.country, latitude:p.location?.latitude, longitude:p.location?.longitude, website:p.websiteUri, phone:p.nationalPhoneNumber, rating:p.rating, reviewsCount:p.userRatingCount, mapsUrl:p.googleMapsUri })), nextPageToken:data.nextPageToken };
  }
  private async demo(input: { country:string; state:string; city:string; category:string; pageToken?:string }): Promise<{ results: DiscoveredBusiness[]; nextPageToken?: string }> {
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
