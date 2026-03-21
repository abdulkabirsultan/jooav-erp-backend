import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from '../../auth/dto/auth-response.dto';

export class CreateUserResponseDto extends UserProfileDto {
  @ApiProperty({
    description: 'Password reset URL for the newly created user',
    example: 'https://app.jooav.com/reset-password?token=abc123...',
  })
  resetUrl: string;

  @ApiProperty({
    description: 'Password reset token expiry date',
    example: '2026-02-11T12:00:00.000Z',
  })
  resetTokenExpiry: Date;
}

export class RegenerateResetTokenResponseDto {
  @ApiProperty({
    description: 'New password reset URL',
    example: 'https://app.jooav.com/reset-password?token=xyz789...',
  })
  resetUrl: string;

  @ApiProperty({
    description: 'Password reset token expiry date',
    example: '2026-02-11T12:00:00.000Z',
  })
  resetTokenExpiry: Date;
}
