import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SUPPORTED_DISPLAY_CURRENCIES, type FxRate } from '@trainova/shared';
import { CurrencyService } from './currency.service';

interface RatesResponse {
  base: 'USD';
  fetchedAt: string | null;
  supported: ReadonlyArray<string>;
  rates: ReadonlyArray<FxRate>;
}

/**
 * T6.A — Public FX endpoint. The web app reads this once on the
 * preferences-resolution path so client formatters can live entirely on
 * the edge (no per-render API call). Cache headers tell Vercel/Cloudflare
 * to share the response across users for one hour, matching the in-process
 * TTL on the service.
 */
@ApiTags('currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currency: CurrencyService) {}

  @Get('rates')
  async rates(): Promise<RatesResponse> {
    const rates = await this.currency.getRates();
    const fetchedAt = rates.length
      ? new Date(
          Math.max(...rates.map((r) => Date.parse(r.fetchedAt))),
        ).toISOString()
      : null;
    return {
      base: 'USD',
      fetchedAt,
      supported: SUPPORTED_DISPLAY_CURRENCIES,
      rates,
    };
  }
}
