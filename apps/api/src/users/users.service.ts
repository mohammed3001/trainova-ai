import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type PreferencesResponse,
  type UpdatePreferencesInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        timezone: true,
        currencyPreference: true,
        status: true,
        avatarUrl: true,
      },
    });
  }

  async getPreferences(userId: string): Promise<PreferencesResponse> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, timezone: true, currencyPreference: true },
    });
    if (!row) throw new NotFoundException('User not found');
    return {
      locale: row.locale,
      timezone: row.timezone,
      currencyPreference: row.currencyPreference,
    };
  }

  async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
  ): Promise<PreferencesResponse> {
    if (input.timezone) {
      // Best-effort runtime check that the supplied IANA name resolves on
      // the host runtime; reject with a 400 rather than silently storing
      // a value the formatter will later reject in the browser.
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
      } catch {
        throw new BadRequestException(`Unknown timezone: ${input.timezone}`);
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.currencyPreference !== undefined
          ? { currencyPreference: input.currencyPreference }
          : {}),
      },
      select: { locale: true, timezone: true, currencyPreference: true },
    });
    return {
      locale: updated.locale,
      timezone: updated.timezone,
      currencyPreference: updated.currencyPreference,
    };
  }
}
