-- Data only (PWA-279): the shades already stored, normalized like normalizarTonalidad
-- (src/articulos/tonalidad.ts) so the duplicate check (name + brand + shade) compares them the same
-- way: `,` `-` `/` -> `.`, no spaces, no trailing dots, nothing left -> NULL.
-- Two active items that end up equal are left as they are (nothing is merged or deactivated): the
-- 409 only shows up when one of them is edited.
-- No backslashes in the patterns: some clients (the mysql CLI) strip them.
UPDATE `Articulo`
SET `tonalidad` = NULLIF(
  REGEXP_REPLACE(
    REGEXP_REPLACE(REGEXP_REPLACE(`tonalidad`, '[,/-]', '.'), '[[:space:]]', ''),
    '[.]+$', ''
  ),
  ''
)
WHERE `tonalidad` IS NOT NULL;
