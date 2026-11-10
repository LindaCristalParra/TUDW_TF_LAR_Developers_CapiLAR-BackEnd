// Checks the environment when the app starts (ConfigModule's validate), so a weak secret stops it
// right away instead of signing tokens that are easy to forge (PWA-267, decided 07/11: in every
// environment). Also the test-only URLs and TRUST_PROXY (PWA-269).

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
  const deSecretos = errores.length > 0;

  // URLs that only exist for the tests (a fake Expo or Meta). They carry the access token and
  // phone numbers or push tokens, so outside this machine they could leak them (PWA-269).
  for (const nombre of URLS_DE_PRUEBA) {
    const valor = texto(config[nombre]);
    if (valor && !esLocal(valor)) {
      errores.push(
        `${nombre} es solo para pruebas: tiene que apuntar a esta máquina (http://127.0.0.1:...) o quedar vacía`,
      );
    }
  }
  // A number of proxies only: "true" would trust any X-Forwarded-For, so a client could pick
  // its own IP and skip the request limits.
  const trustProxy = texto(config.TRUST_PROXY);
  if (trustProxy && !/^[1-9]$/.test(trustProxy)) {
    errores.push(
      'TRUST_PROXY tiene que ser la cantidad de proxies delante de la app (un número de 1 a 9, normalmente 1) o quedar vacía',
    );
  }

  if (errores.length) {
    throw new Error(
      `Configuración insegura en el .env:\n- ${errores.join('\n- ')}` +
        (deSecretos ? `\nGenerá uno nuevo con: ${GENERAR}` : ''),
    );
  }
  return config;
}

const URLS_DE_PRUEBA = ['WHATSAPP_API_URL', 'EXPO_PUSH_URL'] as const;

const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor.trim() : '';

function esLocal(valor: string): boolean {
  try {
    const { protocol, hostname } = new URL(valor);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    );
  } catch {
    return false;
  }
}
