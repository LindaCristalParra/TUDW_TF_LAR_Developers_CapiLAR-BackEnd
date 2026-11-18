import { normalizarTonalidad } from './tonalidad';

describe('normalizarTonalidad', () => {
  it('leaves an already normalized shade as it is', () => {
    expect(normalizarTonalidad('7.1')).toBe('7.1');
    expect(normalizarTonalidad('20vol')).toBe('20vol');
  });

  it('turns commas, hyphens and slashes into dots', () => {
    expect(normalizarTonalidad('7,1')).toBe('7.1');
    expect(normalizarTonalidad('7-1')).toBe('7.1');
    expect(normalizarTonalidad('7/1')).toBe('7.1');
    expect(normalizarTonalidad('10,1-2')).toBe('10.1.2');
  });

  it('removes every space, also tabs and inner ones', () => {
    expect(normalizarTonalidad('20 vol')).toBe('20vol');
    expect(normalizarTonalidad('7 / 1')).toBe('7.1');
    expect(normalizarTonalidad(' 7\t. 1 ')).toBe('7.1');
  });

  it('removes trailing dots, also when they were commas', () => {
    expect(normalizarTonalidad('7.1.')).toBe('7.1');
    expect(normalizarTonalidad('20 Vol.')).toBe('20Vol');
    expect(normalizarTonalidad('7,,')).toBe('7');
    expect(normalizarTonalidad('7. ')).toBe('7');
  });

  it('keeps case and accents (the collation ignores them)', () => {
    expect(normalizarTonalidad('Rubio Ceniza')).toBe('RubioCeniza');
    expect(normalizarTonalidad('Castaño Claro')).toBe('CastañoClaro');
  });

  it('keeps leading dots', () => {
    expect(normalizarTonalidad('.1')).toBe('.1');
  });

  it('is null when nothing is left', () => {
    expect(normalizarTonalidad('')).toBeNull();
    expect(normalizarTonalidad('   ')).toBeNull();
    expect(normalizarTonalidad('.')).toBeNull();
    expect(normalizarTonalidad(' , - / ')).toBeNull();
  });
});
