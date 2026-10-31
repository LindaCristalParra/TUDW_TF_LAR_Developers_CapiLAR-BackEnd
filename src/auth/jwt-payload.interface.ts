import { Rol } from '../generated/prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  rol: Rol;
}
