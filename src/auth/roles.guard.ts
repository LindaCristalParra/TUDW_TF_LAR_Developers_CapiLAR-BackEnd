import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { ROLES_KEY } from './roles.decorator';

// Runs after JwtAuthGuard, so req.user is already loaded from the database:
// the role checked is the current one, not the one stored in the token.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No @Roles(): any logged-in user can access.
    if (!roles) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request>().user as
      PublicUser | undefined;
    if (!user || !roles.includes(user.rol)) {
      throw new ForbiddenException(
        'No tenés permisos para realizar esta acción',
      );
    }
    return true;
  }
}
