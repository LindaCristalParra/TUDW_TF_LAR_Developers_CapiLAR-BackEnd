import { validarEntorno } from './validar-entorno';

const BUENO = 'x'.repeat(32);
const OTRO = 'y'.repeat(48);

// The message validarEntorno throws, or null when it passes.
function error(config: Record<string, unknown>): string | null {
  try {
    validarEntorno(config);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

describe('validarEntorno', () => {
  it('passes with two different secrets of 32+ characters and returns the config as is', () => {
    const config = {
      JWT_SECRET: BUENO,
      JWT_REFRESH_SECRET: OTRO,
      PORT: '3000',
    };
    expect(validarEntorno(config)).toBe(config);
  });

  it.each([
    ['JWT_SECRET', { JWT_SECRET: 'x'.repeat(31), JWT_REFRESH_SECRET: OTRO }],
    ['JWT_REFRESH_SECRET', { JWT_SECRET: BUENO, JWT_REFRESH_SECRET: '' }],
    ['JWT_REFRESH_SECRET', { JWT_SECRET: BUENO }],
  ])('rejects a short or missing %s', (nombre, config) => {
    expect(error(config)).toContain(
      `${nombre} tiene que tener al menos 32 caracteres`,
    );
  });

  it('rejects the change-me examples, also when they are long enough', () => {
    const largo = 'change-me-'.repeat(4);
    expect(error({ JWT_SECRET: largo, JWT_REFRESH_SECRET: OTRO })).toContain(
      'JWT_SECRET todavía tiene el valor de ejemplo',
    );
    expect(
      error({ JWT_SECRET: BUENO, JWT_REFRESH_SECRET: largo.toUpperCase() }),
    ).toContain('JWT_REFRESH_SECRET todavía tiene el valor de ejemplo');
  });

  it('rejects the same secret for both', () => {
    expect(error({ JWT_SECRET: BUENO, JWT_REFRESH_SECRET: BUENO })).toContain(
      'tienen que ser distintos',
    );
  });

  it('lists every problem at once, with the command to generate a secret', () => {
    const mensaje = error({
      JWT_SECRET: 'change-me',
      JWT_REFRESH_SECRET: 'change-me-too',
    });
    expect(mensaje).toContain('JWT_SECRET tiene que tener');
    expect(mensaje).toContain('JWT_REFRESH_SECRET tiene que tener');
    expect(mensaje).toContain('randomBytes(48)');
  });

  it('never puts a secret in the message', () => {
    const secreto = 'z'.repeat(40);
    const mensaje = error({ JWT_SECRET: secreto, JWT_REFRESH_SECRET: secreto });
    expect(mensaje).not.toBeNull();
    expect(mensaje).not.toContain(secreto);
  });
});
