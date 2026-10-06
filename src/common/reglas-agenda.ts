import { Rol } from '../generated/prisma/client';

// Salon business rules for the schedule, in minutes.

/**
 * Roles that can attend turnos when the user has a legajo (Profesional row):
 * professionals, and admins who also work (e.g. the salon owner).
 */
export const ROLES_QUE_ATIENDEN: Rol[] = [Rol.PROFESIONAL, Rol.ADMIN];

/** Shortest service: a hair diagnosis takes 15 minutes. */
export const MIN_DURACION_SERVICIO = 15;

/** Longest turno (sum of all its services): 7 hours. */
export const MAX_DURACION_TURNO = 7 * 60;

/** Longest working day of a professional (sum of their hours for one date): 12 hours. */
export const MAX_JORNADA = 12 * 60;

/** Free slots are offered every 15 minutes. */
export const PASO_HORARIOS = 15;
