import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PublicUser, UsersService } from '../users/users.service';
import { JwtPayload } from './jwt-payload.interface';
import { guardarSid } from './sid-actual.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  // The returned value is attached to the request as `req.user`; the session id goes apart
  // (see SidActual).
  async validate(req: Request, payload: JwtPayload): Promise<PublicUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.fechaBaja !== null) {
      throw new UnauthorizedException();
    }
    guardarSid(req, payload.sid);
    return this.usersService.toPublic(user);
  }
}
