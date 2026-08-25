import path from 'path';

export const exportColumns = ['Empresa', 'Categoria', 'Endereço', 'Cidade', 'Estado', 'Telefone', 'WhatsApp', 'Site', 'URL Final', 'Status Site', 'HTTP', 'Resposta (ms)', 'HTTPS', 'SSL Válido', 'Viewport', 'Título', 'Descrição', 'WordPress', 'Tecnologias', 'Rating', 'Avaliações', 'Google Maps', 'Lead Score', 'Data Descoberta', 'Última Atualização'];

export type ExportBusiness = {
  name: string; category: string; address?: string | null; city: string; state: string; phone?: string | null;
  phones: Array<{ whatsappStatus: string }>; website?: string | null; siteStatus: string; rating?: number | null;
  siteFinalUrl?: string | null; siteHttpStatus?: number | null; siteResponseMs?: number | null; hasHttps?: boolean | null;
  siteSslValid?: boolean | null; hasViewport?: boolean | null; pageTitle?: string | null; metaDescription?: string | null;
  isWordPress?: boolean | null; technologies?: unknown;
  reviewsCount?: number | null; mapsUrl?: string | null; leadScore: number; firstSeenAt: Date; updatedAt: Date;
};

export function businessExportValues(business: ExportBusiness) {
  const technologies = Array.isArray(business.technologies) ? business.technologies.join(', ') : '';
  return [business.name, business.category, business.address, business.city, business.state, business.phone, business.phones[0]?.whatsappStatus, business.website, business.siteFinalUrl, business.siteStatus, business.siteHttpStatus, business.siteResponseMs, business.hasHttps, business.siteSslValid, business.hasViewport, business.pageTitle, business.metaDescription, business.isWordPress, technologies, business.rating, business.reviewsCount, business.mapsUrl, business.leadScore, business.firstSeenAt.toISOString(), business.updatedAt.toISOString()];
}

export function renderBusinessesCsv(rows: ExportBusiness[]) {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [exportColumns, ...rows.map(businessExportValues)].map(row => row.map(escape).join(';')).join('\n');
}

export function persistentExportFilename(format: 'CSV' | 'XLSX', id: string, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `empresas_${stamp}_${id}.${format.toLowerCase()}`;
}

export function safeExportPath(root: string, filename: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, filename);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error('Caminho de exportação inválido');
  return resolved;
}
