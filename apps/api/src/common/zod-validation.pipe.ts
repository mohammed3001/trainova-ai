import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    // Validate body + query params. Query params arrive as strings, so schemas
    // should use `z.coerce.*` or `.transform()` to produce typed values.
    if (metadata.type !== 'body' && metadata.type !== 'query') return value as T;
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.flatten(),
      });
    }
    return result.data;
  }
}
