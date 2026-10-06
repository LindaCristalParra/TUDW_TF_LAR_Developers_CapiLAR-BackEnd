import { Matches } from 'class-validator';

// The salon works in local time. Times of day travel as "HH:mm" and dates as
// "YYYY-MM-DD", so nothing is shifted by time zones.
export const SALON_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Date-time without zone, e.g. "2026-10-07T09:30" (bloqueos de agenda).
const FECHA_HORA_REGEX =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

export function IsHora(campo: string): PropertyDecorator {
  return Matches(HORA_REGEX, {
    message: `${campo} debe tener el formato HH:mm (ej. 09:30)`,
  });
}

export function IsFecha(campo: string): PropertyDecorator {
  return Matches(FECHA_REGEX, {
    message: `${campo} debe tener el formato YYYY-MM-DD (ej. 2026-10-07)`,
  });
}

export function IsFechaHora(campo: string): PropertyDecorator {
  return Matches(FECHA_HORA_REGEX, {
    message: `${campo} debe tener el formato YYYY-MM-DDTHH:mm (ej. 2026-10-07T09:30)`,
  });
}

/** "09:30" -> 570 */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function aHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "2026-10-07" -> Date at 00:00 UTC, the way MySQL DATE columns round-trip. */
export function fechaADate(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** "2026-10-07T09:30" (local wall-clock) -> Date stored as-is in UTC. */
export function fechaHoraADate(fechaHora: string): Date {
  return new Date(`${fechaHora}:00.000Z`);
}

/** Date from a DATE column -> "2026-10-07" */
export function dateAFecha(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado, for a "YYYY-MM-DD" date. */
export function diaSemana(fecha: string): number {
  return fechaADate(fecha).getUTCDay();
}

/** A "YYYY-MM-DD" string that is a real calendar date (rejects 2026-02-30). */
export function esFechaValida(fecha: string): boolean {
  return dateAFecha(fechaADate(fecha)) === fecha;
}

/** Current date and minute of the day in the salon's time zone. */
export function ahoraEnSalon(): { fecha: string; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    minutos: Number(valor('hour')) * 60 + Number(valor('minute')),
  };
}

/** True when [inicioA, finA) and [inicioB, finB) share at least one minute. */
export function seSuperponen(
  inicioA: number,
  finA: number,
  inicioB: number,
  finB: number,
): boolean {
  return inicioA < finB && inicioB < finA;
}
