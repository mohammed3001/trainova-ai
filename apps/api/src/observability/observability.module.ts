import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ERROR_REPORTER, buildErrorReporter } from './error-reporter';

/**
 * Polish pass — wires the error reporter abstraction in as a global
 * provider and registers the global exception filter. Marked `@Global`
 * so feature modules (e.g. ads, fraud, calls) can inject
 * `ERROR_REPORTER` without re-importing the module.
 */
@Global()
@Module({
  providers: [
    {
      provide: ERROR_REPORTER,
      useFactory: () => buildErrorReporter(),
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
  exports: [ERROR_REPORTER],
})
export class ObservabilityModule {}
