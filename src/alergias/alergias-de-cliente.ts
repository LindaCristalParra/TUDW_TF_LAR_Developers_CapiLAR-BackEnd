import { Prisma } from '../generated/prisma/client';

// Cap on alergiaIds in sign-up and profile, so a request can't send a huge list.
export const MAX_ALERGIAS = 30;

// A client's allergies from the list (Cliente.alergias), by name. Also the inactive ones:
// a client keeps showing an allergy after the ADMIN removes it from the list.
export const alergiasDeClienteSelect = {
  select: { alergia: { select: { id: true, nombre: true } } },
  orderBy: { alergia: { nombre: 'asc' } },
} satisfies Prisma.ClienteAlergiaFindManyArgs;

export interface AlergiaDeCliente {
  id: number;
  nombre: string;
}

/** ClienteAlergia rows -> `[{ id, nombre }]`, the shape the API returns. */
export function aplanarAlergias(
  filas: { alergia: AlergiaDeCliente }[],
): AlergiaDeCliente[] {
  return filas.map((fila) => fila.alergia);
}
