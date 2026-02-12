import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { UserRole, UserStatus } from '@prisma/client';

export class UsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter users by role',
    enum: UserRole,
    enumName: 'UserRole',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Filter users by status',
    enum: UserStatus,
    enumName: 'UserStatus',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  get offset(): number {
    return (this.page! - 1) * this.limit!;
  }
}
