import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';
import { UploadController } from './upload.controller';
import cloudinaryConfig from '../../config/cloudinary.config';

@Module({
  imports: [ConfigModule.forFeature(cloudinaryConfig)],
  controllers: [UploadController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class StorageModule {}
