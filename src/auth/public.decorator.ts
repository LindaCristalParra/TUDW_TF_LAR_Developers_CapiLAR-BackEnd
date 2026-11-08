import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Lets a route (or a whole controller) be used without logging in. JwtAuthGuard is global
// (AppModule), so everything not marked with this needs a token.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
