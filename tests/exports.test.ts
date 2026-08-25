import { describe, expect, it } from 'vitest';
import { persistentExportFilename, renderBusinessesCsv, safeExportPath } from '../apps/api/src/exports';

describe('exportações persistentes', () => {
  it('gera CSV UTF-8 com separador e escape compatíveis com Excel', () => {
    const csv = renderBusinessesCsv([{ name: 'Clínica "Saúde"', category: 'Clínica', address: null, city: 'Goiânia', state: 'GO', phone: null, phones: [], website: null, siteStatus: 'NO_WEBSITE', rating: 4.5, reviewsCount: 10, mapsUrl: null, leadScore: 70, firstSeenAt: new Date('2026-08-25T12:00:00Z'), updatedAt: new Date('2026-08-25T13:00:00Z') }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Clínica ""Saúde""";"Clínica"');
  });

  it('gera nome único, legível e com a extensão solicitada', () => {
    expect(persistentExportFilename('XLSX', 'abc123', new Date('2026-08-25T12:34:56Z'))).toBe('empresas_20260825T123456Z_abc123.xlsx');
  });

  it('impede que nomes escapem do diretório persistente', () => {
    expect(safeExportPath('/storage/exports', 'empresas.csv')).toBe('/storage/exports/empresas.csv');
    expect(() => safeExportPath('/storage/exports', '../segredo.txt')).toThrow('Caminho de exportação inválido');
  });
});
