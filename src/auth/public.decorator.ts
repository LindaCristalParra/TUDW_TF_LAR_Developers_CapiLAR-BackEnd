import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Lets a route be used without logging in, even when the controller uses JwtAuthGuard.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
