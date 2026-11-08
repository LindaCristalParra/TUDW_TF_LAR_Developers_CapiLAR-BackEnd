import { Rol } from '../generated/prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  rol: Rol;
  // Session id (Sesion.sid), so a route can tell which device is calling (the push token).
  // Missing in access tokens issued before PWA-265.
  sid?: string;
}
