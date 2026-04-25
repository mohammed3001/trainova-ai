import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicTaxProfile, TaxProfileInput } from '@trainova/shared';
import { taxProfileInputSchema } from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaxProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<PublicTaxProfile | null> {
    const row = await this.prisma.taxProfile.findUnique({ where: { userId } });
    return row ? toPublic(row) : null;
  }

  async upsert(
    userId: string,
    input: TaxProfileInput,
  ): Promise<PublicTaxProfile> {
    const data = taxProfileInputSchema.parse(input);
    const existing = await this.prisma.taxProfile.findUnique({
      where: { userId },
    });
    const nextTaxId = data.taxId ?? null;
    const nextCountry = data.countryCode.toUpperCase();
    // Only invalidate prior admin verification when the taxId itself
    // actually changes OR when the country code changes. Editing
    // unrelated fields (address, legal name, etc.) must not silently
    // downgrade a verified profile. Country must invalidate too: a tax
    // ID verified by ZATCA (Saudi Arabia) is not valid under BZSt
    // (Germany), and `payments.service.ts` resolves tax rules off the
    // *current* countryCode, so reusing a stale `taxIdVerified` flag
    // across jurisdictions would zero-rate the wrong invoices.
    const countryChanged = existing != null && existing.countryCode !== nextCountry;
    const taxIdChanged = !existing || existing.taxId !== nextTaxId || countryChanged;
    const row = await this.prisma.taxProfile.upsert({
      where: { userId },
      create: {
        userId,
        countryCode: nextCountry,
        kind: data.kind,
        legalName: data.legalName ?? null,
        taxId: nextTaxId,
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        city: data.city ?? null,
        region: data.region ?? null,
        postalCode: data.postalCode ?? null,
      },
      update: {
        countryCode: nextCountry,
        kind: data.kind,
        legalName: data.legalName ?? null,
        taxId: nextTaxId,
        ...(taxIdChanged ? { taxIdVerified: false } : {}),
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        city: data.city ?? null,
        region: data.region ?? null,
        postalCode: data.postalCode ?? null,
      },
    });
    return toPublic(row);
  }

  async adminVerify(userId: string, verified: boolean): Promise<PublicTaxProfile> {
    const row = await this.prisma.taxProfile.findUnique({ where: { userId } });
    if (!row) throw new NotFoundException('Tax profile not found');
    const updated = await this.prisma.taxProfile.update({
      where: { userId },
      data: { taxIdVerified: verified },
    });
    return toPublic(updated);
  }
}

function toPublic(r: {
  countryCode: string;
  kind: string;
  legalName: string | null;
  taxId: string | null;
  taxIdVerified: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
}): PublicTaxProfile {
  return {
    countryCode: r.countryCode,
    kind: r.kind as PublicTaxProfile['kind'],
    legalName: r.legalName,
    taxId: r.taxId,
    taxIdVerified: r.taxIdVerified,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    region: r.region,
    postalCode: r.postalCode,
  };
}
