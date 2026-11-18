/**
 * How an item's shade is stored (decided 10/11, PWA-279), so the duplicate check (name + brand +
 * shade) finds the same shade written in different ways: "7,1", "7-1", "7 / 1" and "7.1." are all
 * "7.1", and "20 vol" is "20vol". Case and accents stay as typed: the column's collation already
 * ignores them.
 * - `,`, `-` and `/` become `.`
 * - every space is removed
 * - trailing dots are removed
 * - nothing left: null (no shade)
 * The data migration `normalize_articulo_tonalidad` applies the same rule to the stored ones.
 */
export function normalizarTonalidad(tonalidad: string): string | null {
  const normalizada = tonalidad
    .replace(/[,\-/]/g, '.')
    .replace(/\s/g, '')
    .replace(/\.+$/, '');
  return normalizada || null;
}
