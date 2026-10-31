import { IsOptional, IsString } from 'class-validator';

// Only the mobile app (header X-Client: mobile) sends it; the web uses the cookie.
export class RefreshTokenDto {
  /** Refresh token recibido en el login (solo la app, con `X-Client: mobile`). */
  @IsString({ message: 'El refresh token debe ser un texto' })
  @IsOptional()
  refreshToken?: string;
}
