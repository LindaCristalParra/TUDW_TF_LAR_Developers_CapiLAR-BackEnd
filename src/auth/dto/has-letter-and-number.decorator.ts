import { Matches } from 'class-validator';

// Same rule as the front-end: at least one letter (A-Z, a-z) and one digit.
// Length is checked by MinLength/MaxLength, each with its own message.
export function HasLetterAndNumber(): PropertyDecorator {
  return Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'La contraseña debe tener al menos una letra y un número',
  });
}
