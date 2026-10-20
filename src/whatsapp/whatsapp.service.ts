import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const GRAPH_URL = 'https://graph.facebook.com/v23.0';

// Constant-time comparison, so the response time doesn't leak how much of a secret matched.
function iguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Turns a phone as typed by the user ("299 15-555-1234", "0299 5551234", "+54 9 299 555 1234")
 * into the number WhatsApp expects: 54 + area code + number, without the 9 (that's the format
 * that worked with Meta's test number). null when it doesn't give a 10-digit national number.
 */
export function aNumeroWhatsApp(telefono: string): string | null {
  let digitos = telefono.replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.startsWith('54')) {
    digitos = digitos.slice(2);
    if (digitos.startsWith('9')) digitos = digitos.slice(1);
  }
  if (digitos.startsWith('0')) digitos = digitos.slice(1);

  // Mobile "15" after the area code (2 to 4 digits): 12 digits with it, 10 without.
  if (digitos.length === 12) {
    const largoArea = [2, 3, 4].find(
      (largo) => digitos.slice(largo, largo + 2) === '15',
    );
    if (largoArea) {
      digitos = digitos.slice(0, largoArea) + digitos.slice(largoArea + 2);
    }
  }
  return digitos.length === 10 ? `54${digitos}` : null;
}

@Injectable()
export class WhatsAppService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Sends an approved template (Meta Cloud API). `parametros` fill the body's {{1}}, {{2}}...
   * in order; `respuestas` are the payloads of its quick reply buttons, in order (they come
   * back in the webhook when the user taps one). Returns the message id; throws if Meta
   * rejects it.
   */
  async enviarPlantilla(
    numero: string,
    plantilla: string,
    parametros: string[] = [],
    respuestas: string[] = [],
    idioma = 'es_AR',
  ): Promise<string> {
    const components: object[] = [];
    if (parametros.length) {
      components.push({
        type: 'body',
        parameters: parametros.map((text) => ({ type: 'text', text })),
      });
    }
    respuestas.forEach((payload, index) =>
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(index),
        parameters: [{ type: 'payload', payload }],
      }),
    );

    return this.enviar({
      to: numero,
      type: 'template',
      template: { name: plantilla, language: { code: idioma }, components },
    });
  }

  /**
   * Free text. WhatsApp only delivers it within 24 h of the user's last message (e.g. the
   * answer to a tap on a reminder button); otherwise Meta rejects it.
   */
  async enviarTexto(numero: string, texto: string): Promise<string> {
    return this.enviar({ to: numero, type: 'text', text: { body: texto } });
  }

  /** Webhook setup in Meta: GET with hub.mode=subscribe and our verify token. */
  suscripcionValida(modo?: string, token?: string): boolean {
    const esperado = this.configService.getOrThrow<string>(
      'WHATSAPP_VERIFY_TOKEN',
    );
    return modo === 'subscribe' && !!token && iguales(token, esperado);
  }

  /** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 of the raw body with the app secret. */
  firmaValida(cuerpo: Buffer | undefined, firma: string | undefined): boolean {
    if (!cuerpo || !firma) return false;
    const secreto = this.configService.getOrThrow<string>(
      'WHATSAPP_APP_SECRET',
    );
    const esperada = `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
    return iguales(firma, esperada);
  }

  private async enviar(mensaje: object): Promise<string> {
    const phoneNumberId = this.configService.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const respuesta = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.configService.getOrThrow<string>('WHATSAPP_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...mensaje }),
    });

    const datos = (await respuesta.json()) as {
      messages?: { id: string }[];
      error?: { code: number; message: string };
    };
    if (!respuesta.ok || !datos.messages?.length) {
      throw new Error(
        `WhatsApp ${datos.error?.code ?? respuesta.status}: ${datos.error?.message ?? 'no message id'}`,
      );
    }
    return datos.messages[0].id;
  }
}
