import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { EsCuitValido, LimpiarCuit } from '../cuit';

// Optional text fields: trims, and "" (or only spaces) is stored as NULL, like null itself.
// One transform instead of @Trim() + another one, so the order between them doesn't matter.
const TextoOpcional = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const texto = value.trim();
    return texto === '' ? null : texto;
  });

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateProveedorDto {
  /**
   * 11 dígitos con dígito verificador válido. Se aceptan guiones o espacios
   * ("30-71234567-8"); se guarda y se devuelve solo con los números.
   * @example "30712345678"
   */
  @EsCuitValido({ message: 'El CUIT no es válido (revisá los números)' })
  @Matches(/^\d{11}$/, { message: 'El CUIT debe tener 11 números' })
  @IsString({ message: 'El CUIT debe ser un texto' })
  @IsNotEmpty({ message: 'El CUIT es obligatorio' })
  // Also removes the surrounding spaces, so no @Trim().
  @LimpiarCuit()
  cuit: string;

  /** @example "Distribuidora Meraki S.R.L." */
  @MaxLength(150, {
    message: 'La razón social no puede superar los 150 caracteres',
  })
  @IsString({ message: 'La razón social debe ser un texto' })
  @IsNotEmpty({ message: 'La razón social es obligatoria' })
  @Trim()
  razonSocial: string;

  /**
   * Texto libre (puede llevar código de área, guiones o interno). `""` o `null`
   * lo borra.
   * @example "(0299) 448-1234"
   */
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres' })
  @IsString({ message: 'El teléfono debe ser un texto' })
  @IsOptional()
  @TextoOpcional()
  telefono?: string | null;

  /** `""` o `null` lo borra. @example "ventas@meraki.com.ar" */
  @MaxLength(191, { message: 'El email no puede superar los 191 caracteres' })
  @IsEmail({}, { message: 'El email no es válido' })
  @IsOptional()
  @TextoOpcional()
  email?: string | null;

  /**
   * Texto libre (plazos, descuentos, pedido mínimo). `""` o `null` lo borra.
   * @example "30 días, 5% por pago contado"
   */
  @MaxLength(500, {
    message: 'Las condiciones comerciales no pueden superar los 500 caracteres',
  })
  @IsString({ message: 'Las condiciones comerciales deben ser un texto' })
  @IsOptional()
  @TextoOpcional()
  condicionesComerciales?: string | null;
}
