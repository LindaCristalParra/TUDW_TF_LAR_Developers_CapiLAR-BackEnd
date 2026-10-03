import {
  IsHexadecimal,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsHexadecimal()
  @Length(64, 64)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  contrasena: string;
}
