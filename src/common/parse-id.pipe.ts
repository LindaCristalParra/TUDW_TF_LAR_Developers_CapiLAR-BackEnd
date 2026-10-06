import { BadRequestException, ParseIntPipe } from '@nestjs/common';

// Route ids must be integers; the default ParseIntPipe message is in English.
export const ParseIdPipe = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('El id debe ser un número'),
});
