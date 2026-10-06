// Salon business rules for the schedule, in minutes.

/** Shortest service: a hair diagnosis takes 15 minutes. */
export const MIN_DURACION_SERVICIO = 15;

/** Longest turno (sum of all its services): 7 hours. */
export const MAX_DURACION_TURNO = 7 * 60;

/** Longest working day of a professional (sum of their hours for one weekday): 12 hours. */
export const MAX_JORNADA = 12 * 60;

/** Free slots are offered every 15 minutes. */
export const PASO_HORARIOS = 15;
