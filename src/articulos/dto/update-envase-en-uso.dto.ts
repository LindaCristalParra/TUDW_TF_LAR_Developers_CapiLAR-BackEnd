import { IsNotEmpty, IsNumber, Min } from 'class-validator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class UpdateEnvaseEnUsoDto {
  /**
   * Lo que queda en el envase abierto, en el `tipoPeso` del artículo (ej. al
   * pesarlo). De 0 al contenido del envase (`pesoInicial`).
   * @example 35.5
   */
  @Min(0, { message: 'Lo que queda en el envase no puede ser negativo' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'Lo que queda en el envase debe ser un número con hasta 2 decimales',
    },
  )
  @IsNotEmpty({ message: 'Lo que queda en el envase es obligatorio' })
  pesoActual: number;
}
