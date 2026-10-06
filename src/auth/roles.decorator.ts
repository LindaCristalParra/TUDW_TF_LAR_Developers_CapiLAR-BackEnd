import { SetMetadata } from '@nestjs/common';
import { Rol } from '../generated/prisma/client';

export const ROLES_KEY = 'roles';

// Restricts a route (or a whole controller) to the given roles. Used with RolesGuard.
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
