import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.service';
import { FileModule } from './common/file/file.module';
import { WargaModule } from './warga/warga.module';
import { PengumumanModule } from './pengumuman/pengumuman.module';
import { KegiatanModule } from './kegiatan/kegiatan.module';
import { IplModule } from './ipl/ipl.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionGuard } from './auth/permission.guard';
import { PengaduanModule } from './pengaduan/pengaduan.module';
import { NotifikasiModule } from './notifikasi/notifikasi.module';
import { PushModule } from './push/push.module';
import { KeuanganModule } from './keuangan/keuangan.module';
import { SetoranModule } from './setoran/setoran.module';
import { CatatanRapatModule } from './catatan-rapat/catatan-rapat.module';
import { RbacModule } from './rbac/rbac.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Job auto-teruskan pengaduan RT yang tidak ditanggapi 7 hari (PengaduanService).
    ScheduleModule.forRoot(),
    // Batas umum per IP; endpoint rawan brute-force diperketat via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    FileModule,
    AuditModule,
    AuthModule,
    RbacModule,
    NotifikasiModule,
    PushModule,
    WargaModule,
    PengumumanModule,
    KegiatanModule,
    IplModule,
    SetoranModule,
    PengaduanModule,
    KeuanganModule,
    CatatanRapatModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Urutan penting: rate limit, login (JwtAuthGuard), lalu permission.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
