import { Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TRAINER')
@Controller('trainer/payments')
export class TrainerPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('connect/onboard')
  async onboard(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true },
    });
    if (!row) throw new NotFoundException('User not found');
    return this.payments.startConnectOnboarding(row);
  }

  @Get('connect')
  getConnect(@CurrentUser() user: AuthUser) {
    return this.payments.getConnectAccount(user.id);
  }

  @Post('connect/refresh')
  refresh(@CurrentUser() user: AuthUser) {
    return this.payments.refreshConnectAccount(user.id);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.payments.getEarningsSummary(user.id);
  }

  @Get('payouts')
  payouts(@CurrentUser() user: AuthUser) {
    return this.payments.listPayouts(user.id);
  }
}
