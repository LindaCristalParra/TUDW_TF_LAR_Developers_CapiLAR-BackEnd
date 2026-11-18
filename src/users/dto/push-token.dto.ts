import { IsString, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class PushTokenDto {
  /**
   * El push token de Expo del celular (`getExpoPushTokenAsync`).
   * @example "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
   */
  @Matches(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, {
    message: 'El token no es un push token de Expo',
  })
  @MaxLength(255, { message: 'El token no puede superar los 255 caracteres' })
  @IsString({ message: 'El token debe ser un texto' })
  @Trim()
  token: string;
}
