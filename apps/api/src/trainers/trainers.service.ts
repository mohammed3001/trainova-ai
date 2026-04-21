import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateTrainerProfileInput } from '@trainova/shared';

@Injectable()
export class TrainersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(params: { skill?: string; country?: string; limit?: number; offset?: number }) {
    const where = {
      verified: undefined as boolean | undefined,
      ...(params.country ? { country: { equals: params.country, mode: 'insensitive' as const } } : {}),
      ...(params.skill
        ? { skills: { some: { skill: { slug: params.skill } } } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.trainerProfile.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          skills: { include: { skill: true }, take: 8 },
        },
        orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(params.limit ?? 24, 60),
        skip: params.offset ?? 0,
      }),
      this.prisma.trainerProfile.count({ where }),
    ]);
    return { items, total };
  }

  async findBySlug(slug: string) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { slug },
      include: {
        user: { select: { id: true, name: true, createdAt: true } },
        skills: { include: { skill: true } },
      },
    });
    if (!profile) throw new NotFoundException('Trainer not found');
    return profile;
  }

  async findMe(userId: string) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      include: { skills: { include: { skill: true } } },
    });
    if (!profile) throw new NotFoundException('Trainer profile not found');
    return profile;
  }

  async updateMe(userId: string, data: UpdateTrainerProfileInput) {
    const profile = await this.prisma.trainerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Trainer profile not found');
    const { skills, ...rest } = data;
    await this.prisma.trainerProfile.update({ where: { id: profile.id }, data: rest });

    if (skills) {
      const skillRows = await this.prisma.skill.findMany({
        where: { slug: { in: skills } },
        select: { id: true },
      });
      await this.prisma.trainerSkill.deleteMany({ where: { profileId: profile.id } });
      if (skillRows.length) {
        await this.prisma.trainerSkill.createMany({
          data: skillRows.map((s) => ({ profileId: profile.id, skillId: s.id })),
          skipDuplicates: true,
        });
      }
    }

    return this.findMe(userId);
  }
}
