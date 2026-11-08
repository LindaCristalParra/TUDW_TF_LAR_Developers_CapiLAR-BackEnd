// Checks the environment when the app starts (ConfigModule's validate), so a weak secret stops it
// right away instead of signing tokens that are easy to forge (PWA-267, decided 07/11: in every
// environment).

const SECRETOS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
// 32 characters of base64url are 192 bits, more than enough for HS256.
const MIN_LARGO_SECRETO = 32;
const GENERAR =
  "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"";

export function validarEntorno(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errores: string[] = [];
  for (const nombre of SECRETOS) {
    const valor = config[nombre];
    if (typeof valor !== 'string' || valor.length < MIN_LARGO_SECRETO) {
      errores.push(
        `${nombre} tiene que tener al menos ${MIN_LARGO_SECRETO} caracteres`,
      );
    } else if (/change-me/i.test(valor)) {
      errores.push(`${nombre} todavía tiene el valor de ejemplo`);
    }
  }
  // The same secret for both would let a refresh token pass as an access token.
  if (
    typeof config.JWT_SECRET === 'string' &&
    config.JWT_SECRET === config.JWT_REFRESH_SECRET
  ) {
    errores.push('JWT_SECRET y JWT_REFRESH_SECRET tienen que ser distintos');
  }
  if (errores.length) {
    throw new Error(
      `Configuración insegura en el .env:\n- ${errores.join('\n- ')}\nGenerá uno nuevo con: ${GENERAR}`,
    );
  }
  return config;
}
