import { ApiOkResponse } from '@nestjs/swagger';

const imagen = { schema: { type: 'string', format: 'binary' } };

/** Swagger: the response body is the image itself. */
export const ApiFoto = () =>
  ApiOkResponse({
    description: 'La imagen (JPG, PNG o WEBP)',
    content: {
      'image/jpeg': imagen,
      'image/png': imagen,
      'image/webp': imagen,
    },
  });
