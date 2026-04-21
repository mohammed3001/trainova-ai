import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users() {
    return this.admin.listUsers();
  }

  @Get('companies')
  companies() {
    return this.admin.listCompanies();
  }

  @Get('requests')
  requests() {
    return this.admin.listRequests();
  }

  @Get('skills')
  skills() {
    return this.admin.listSkills();
  }
}
