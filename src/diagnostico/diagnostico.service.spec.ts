import { ConfigService } from '@nestjs/config';
import { DiagnosticoService, SUGERENCIA_SIMULADA } from './diagnostico.service';

// ConfigService with only the given variables.
function configCon(variables: Record<string, string>): ConfigService {
  return new ConfigService(variables);
}

const FOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe('DiagnosticoService', () => {
  describe('GEMINI_MODO=simulado', () => {
    it('returns the fixed suggestion flagged as simulated', async () => {
      const service = new DiagnosticoService(
        configCon({ GEMINI_MODO: 'simulado' }),
      );

      const sugerencia = await service.sugerir(FOTO, 'image/jpeg');

      expect(sugerencia).toEqual(SUGERENCIA_SIMULADA);
      expect(sugerencia.simulado).toBe(true);
    });

    it('does not need the Gemini key', async () => {
      const service = new DiagnosticoService(
        configCon({ GEMINI_MODO: 'simulado' }),
      );

      await expect(service.sugerir(FOTO, 'image/jpeg')).resolves.toBeDefined();
    });
  });
});
