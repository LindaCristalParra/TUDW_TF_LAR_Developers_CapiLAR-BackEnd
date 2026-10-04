import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Covers a missing, invalid or expired token, and a user that no longer exists.
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new UnauthorizedException(
        'Tenés que iniciar sesión para acceder a este recurso',
      );
    }
    return user;
  }
}
