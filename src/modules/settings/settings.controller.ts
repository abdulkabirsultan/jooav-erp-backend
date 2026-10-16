import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(UnifiedAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('payment')
  @ApiOperation({
    summary: 'Get the active payment method and visible manual bank accounts',
  })
  getPaymentSettings() {
    return this.settingsService.getPublicPaymentSettings();
  }
}
