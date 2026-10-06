import { IsEmail, IsNotEmpty } from 'class-validator';
import { Trim } from './trim.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class ForgotPasswordDto {
  /** @example "martina.zarate@gmail.com" */
  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  @Trim()
  email: string;
}
