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
import { UpdateWarehouseSettingsDto } from './dto/warehouse-settings.dto';
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
  async updatePaymentSettings(@Body() dto: UpdatePaymentSettingsDto) {
    const settings = await this.settingsService.updatePaymentSettings(dto);

    return {
      success: true,
      message: 'Payment settings updated successfully',
      data: settings,
    };
  }

  @Get('warehouse')
  @ApiOperation({
    summary: 'Get the warehouse WhatsApp contacts used to share orders',
  })
  getWarehouseSettings() {
    return this.settingsService.getWarehouseSettings();
  }

  @Put('warehouse')
  @RequireAdminPermissions('canModifySystemConfig')
  @ApiOperation({
    summary: 'Update the warehouse WhatsApp contacts',
    description:
      'Requires the canModifySystemConfig permission; SUPER_ADMIN always has it.',
  })
  async updateWarehouseSettings(@Body() dto: UpdateWarehouseSettingsDto) {
    const settings = await this.settingsService.updateWarehouseSettings(dto);

    return {
      success: true,
      message: 'Warehouse settings updated successfully',
      data: settings,
    };
  }
}
