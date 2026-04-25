import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  SUPPORTED_DISPLAY_CURRENCIES,
  type FxRate,
  type DisplayCurrency,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cache TTL — Frankfurter publishes rates once per TARGET2 settlement
 * day, so a six-hour TTL still hits the daily fixing while smoothing
 * over network blips. Lookups inside the TTL serve from the most-recent
 * row in `ExchangeRate`.
 */
const RATE_TTL_MS = 6 * 60 * 60 * 1000;

const FRANKFURTER_BASE = 'https://api.frankfurter.app';

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

/**
 * T6.A — FX rate cache + display-currency conversion. We always anchor
 * stored rates to USD; the formatter does at most two hops (from→USD,
 * USD→to). Routes that don't have a USD pair return `null` and the
 * caller falls back to displaying the source currency unchanged.
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private inflight: Promise<FxRate[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return the most recent USD-anchored rate for every supported quote
   * currency, refreshing the cache from Frankfurter when the latest row
   * is older than `RATE_TTL_MS`.
   */
  async getRates(): Promise<FxRate[]> {
    const fresh = await this.loadFromDb();
    const oldest = fresh.length
      ? Math.min(...fresh.map((r) => Date.parse(r.fetchedAt)))
      : 0;
    const stale = !fresh.length || Date.now() - oldest > RATE_TTL_MS;
    if (!stale) return fresh;
    try {
      return await this.refreshOnce();
    } catch (err) {
      // Refresh failure is non-fatal — serve whatever we have so the UI
      // doesn't blank out money columns. The next request will retry.
      this.logger.warn(`FX refresh failed; serving stale rates: ${(err as Error).message}`);
      return fresh;
    }
  }

  async convertMinorUnits(
    amount: number,
    from: string,
    to: string,
  ): Promise<number | null> {
    if (from === to) return amount;
    const rates = await this.getRates();
    return convert(amount, from, to, rates);
  }

  // -------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------

  private async loadFromDb(): Promise<FxRate[]> {
    // For each (base, quote) pair, take the most recent row.
    const rows = await this.prisma.$queryRaw<
      { base: string; quote: string; rate: Prisma.Decimal; fetchedAt: Date }[]
    >`
      SELECT DISTINCT ON ("base", "quote")
        "base", "quote", "rate", "fetchedAt"
      FROM "ExchangeRate"
      ORDER BY "base", "quote", "fetchedAt" DESC
    `;
    return rows.map((r) => ({
      base: r.base,
      quote: r.quote,
      rate: Number(r.rate),
      fetchedAt: r.fetchedAt.toISOString(),
    }));
  }

  private async refreshOnce(): Promise<FxRate[]> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async doRefresh(): Promise<FxRate[]> {
    const quotes = SUPPORTED_DISPLAY_CURRENCIES.filter((c) => c !== 'USD');
    const url = `${FRANKFURTER_BASE}/latest?from=USD&to=${quotes.join(',')}`;
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Frankfurter ${res.status}`);
    }
    const body = (await res.json()) as FrankfurterResponse;
    if (!body.rates || typeof body.rates !== 'object') {
      throw new Error('Frankfurter response missing rates');
    }
    const fetchedAt = new Date();
    const rows: { base: DisplayCurrency; quote: string; rate: number }[] = [];
    for (const [quote, rate] of Object.entries(body.rates)) {
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue;
      rows.push({ base: 'USD', quote, rate });
    }
    if (!rows.length) {
      throw new Error('Frankfurter returned no usable rates');
    }
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.exchangeRate.create({
          data: {
            base: r.base,
            quote: r.quote,
            rate: new Prisma.Decimal(r.rate.toFixed(8)),
            fetchedAt,
          },
        }),
      ),
    );
    this.logger.log(`FX refresh: persisted ${rows.length} USD rates from frankfurter`);
    return rows.map((r) => ({
      base: r.base,
      quote: r.quote,
      rate: r.rate,
      fetchedAt: fetchedAt.toISOString(),
    }));
  }
}

// ---------------------------------------------------------------------
// helpers — duplicated from shared/currency.ts so the service can run
// without an extra import hop. Kept in one place via the test below.
// ---------------------------------------------------------------------

function convert(
  amount: number,
  from: string,
  to: string,
  rates: ReadonlyArray<FxRate>,
): number | null {
  const F = from.toUpperCase();
  const T = to.toUpperCase();
  if (F === T) return amount;
  const minor = (code: string) => {
    const ZERO = ['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF'];
    return ZERO.includes(code.toUpperCase()) ? 1 : 100;
  };
  const fromMajor = amount / minor(F);
  const usd = F === 'USD' ? fromMajor : via(fromMajor, F, 'USD', rates);
  if (usd == null) return null;
  const major = T === 'USD' ? usd : via(usd, 'USD', T, rates);
  if (major == null) return null;
  return Math.round(major * minor(T));
}

function via(
  amount: number,
  from: string,
  to: string,
  rates: ReadonlyArray<FxRate>,
): number | null {
  const direct = rates.find((r) => r.base === from && r.quote === to);
  if (direct) return amount * direct.rate;
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (inverse && inverse.rate !== 0) return amount / inverse.rate;
  return null;
}
