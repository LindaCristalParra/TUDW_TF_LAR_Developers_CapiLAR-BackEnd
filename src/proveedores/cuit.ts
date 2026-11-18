import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// AFIP check digit (módulo 11) over the first 10 digits. A remainder that gives 10 has no valid
// digit for that prefix (AFIP assigns another prefix), so it is rejected.
export function cuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) {
    return false;
  }
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const digito = resto === 11 ? 0 : resto;
  return digito !== 10 && digito === Number(cuit[10]);
}

// "30-71234567-8" or "30 71234567 8" → "30712345678". Non-string values are left as they are.
export function limpiarCuit(valor: string): string {
  return valor.replace(/[\s-]/g, '');
}

export function LimpiarCuit(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? limpiarCuit(value) : value,
  );
}

export function EsCuitValido(opciones?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'esCuitValido',
      target: target.constructor,
      propertyName: propertyName as string,
      options: opciones,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && cuitValido(value),
      },
    });
  };
}
