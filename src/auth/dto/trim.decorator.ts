import { Transform } from 'class-transformer';

// Removes surrounding spaces before validation; non-string values are left as they are.
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
