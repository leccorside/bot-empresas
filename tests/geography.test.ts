import { describe, expect, it } from 'vitest';
import { generateGeographicGrid, validateGeographicBounds } from '../packages/shared/src';

const goianiaBounds = { south: -16.75, north: -16.55, west: -49.4, east: -49.2 };

describe('grid geográfico', () => {
  it('cobre todo o bounding box com células ordenadas e sem exceder o limite', () => {
    const cells = generateGeographicGrid(goianiaBounds, 5_000, 500);
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.length).toBeLessThanOrEqual(500);
    expect(cells.map(cell => cell.sequence)).toEqual(cells.map((_, index) => index));
    expect(Math.min(...cells.map(cell => cell.south))).toBe(goianiaBounds.south);
    expect(Math.max(...cells.map(cell => cell.north))).toBe(goianiaBounds.north);
    expect(Math.min(...cells.map(cell => cell.west))).toBe(goianiaBounds.west);
    expect(Math.max(...cells.map(cell => cell.east))).toBe(goianiaBounds.east);
    expect(cells.every(cell => cell.latitude > cell.south && cell.latitude < cell.north && cell.longitude > cell.west && cell.longitude < cell.east && cell.radius > 0)).toBe(true);
  });

  it('aumenta automaticamente a célula para respeitar GRID_MAX_CELLS', () => {
    const cells = generateGeographicGrid({ south: -18, north: -15, west: -51, east: -48 }, 1_000, 12);
    expect(cells.length).toBeLessThanOrEqual(12);
    expect(cells.length).toBeGreaterThan(0);
  });

  it('gera o mesmo grid para os mesmos limites', () => {
    expect(generateGeographicGrid(goianiaBounds, 4_000, 100)).toEqual(generateGeographicGrid(goianiaBounds, 4_000, 100));
  });

  it('rejeita bounding boxes vazios ou fora do intervalo terrestre', () => {
    expect(() => validateGeographicBounds({ south: 10, north: 10, west: -50, east: -49 })).toThrow('latitude');
    expect(() => generateGeographicGrid({ south: -91, north: -10, west: -50, east: -49 })).toThrow('latitude');
    expect(() => generateGeographicGrid({ south: -20, north: -10, west: 40, east: -40 })).toThrow('longitude');
  });
});
