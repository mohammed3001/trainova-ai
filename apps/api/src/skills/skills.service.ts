import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.skill.findMany({ orderBy: { nameEn: 'asc' } });
  }

  async findBySlug(slug: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { slug },
      include: {
        trainerSkills: {
          take: 12,
          include: {
            profile: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
        },
        requestSkills: {
          take: 10,
          include: {
            request: {
              select: {
                id: true,
                slug: true,
                title: true,
                modelFamily: true,
                industry: true,
                status: true,
                publishedAt: true,
                company: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    return skill;
  }
}
