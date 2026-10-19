import { dateAFecha, fechaADate } from '../common/fecha-hora';
import { FrecuenciaSerie } from '../generated/prisma/client';

// Used by the series and by a client booking one of its dates (POST /turnos with serieId).

export const DIAS_FRECUENCIA: Record<FrecuenciaSerie, number> = {
  SEMANAL: 7,
  QUINCENAL: 14,
  CADA_20_DIAS: 20,
  MENSUAL: 28,
};

/** "2026-10-07" + 7 -> "2026-10-14" */
export function sumarDias(fecha: string, dias: number): string {
  const date = fechaADate(fecha);
  date.setUTCDate(date.getUTCDate() + dias);
  return dateAFecha(date);
}

/** desde, desde + dias, ... while <= hasta. */
export function fechasCada(
  desde: string,
  hasta: string,
  dias: number,
): string[] {
  const fechas: string[] = [];
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, dias)) {
    fechas.push(fecha);
  }
  return fechas;
}

/** Every date of a series, "YYYY-MM-DD". */
export function fechasDeSerie(serie: {
  fechaInicio: Date;
  fechaFin: Date;
  frecuencia: FrecuenciaSerie;
}): string[] {
  return fechasCada(
    dateAFecha(serie.fechaInicio),
    dateAFecha(serie.fechaFin),
    DIAS_FRECUENCIA[serie.frecuencia],
  );
}
