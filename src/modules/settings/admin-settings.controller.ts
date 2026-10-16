import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  AdminPermissionsGuard,
  RequireAdminPermissions,
} from '../../common/guards/admin-permissions.guard';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Admin Settings')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(UnifiedAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('payment')
  @ApiOperation({
    summary: 'Get full payment settings (includes hidden accounts)',
  })
  getPaymentSettings() {
    return this.settingsService.getPaymentSettings();
  }

  @Put('payment')
  @RequireAdminPermissions('canModifySystemConfig')
  @ApiOperation({
    summary: 'Update the payment method and manual bank accounts',
    description:
      'Requires the canModifySystemConfig permission; SUPER_ADMIN always has it.',
  })
  updatePaymentSettings(@Body() dto: UpdatePaymentSettingsDto) {
    return this.settingsService.updatePaymentSettings(dto);
  }
}
