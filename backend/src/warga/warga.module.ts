// src/warga/warga.module.ts
import { Module } from '@nestjs/common';
import { WargaService } from './warga.service';
import { WargaController } from './warga.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotifikasiModule } from '../notifikasi/notifikasi.module';

@Module({
  imports: [PrismaModule, AuthModule, NotifikasiModule],
  controllers: [WargaController],
  providers: [WargaService],
})
export class WargaModule {}
