import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreatePengaduanDto } from './dto/create-pengaduan.dto';
import { RespondPengaduanDto } from './dto/respond-pengaduan.dto';
import { pengaduanMulterOptions } from './pengaduan.multer';
import { PengaduanService } from './pengaduan.service';
import {
  Access,
  CurrentUser,
  RequirePermission,
} from '../auth/permission.decorators';
import type { AccessContext, AuthUser } from '../auth/auth.types';

@Controller('pengaduan')
export class PengaduanController {
  constructor(private readonly pengaduanService: PengaduanService) {}

  /**
   * Sengaja tanpa @RequirePermission: pemegang `pengaduan.create_rw` ATAU
   * `pengaduan.create_rt` boleh masuk (dicek di service via getTujuanPilihan).
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', pengaduanMulterOptions))
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePengaduanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.pengaduanService.create(user, dto, file);
  }

  /** Daftar pengaduan sesuai scope: warga = miliknya, RT = warga RT-nya, RW = semua. */
  @Get()
  @RequirePermission('pengaduan', 'read')
  findAll(@Access() ctx: AccessContext) {
    return this.pengaduanService.findAll(ctx);
  }

  /** GET /pengaduan/user/:userId — daftar pengaduan milik satu warga */
  @Get('user/:userId')
  @RequirePermission('pengaduan', 'read')
  findByUser(
    @Access() ctx: AccessContext,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.pengaduanService.findByUser(ctx, userId);
  }

  /**
   * GET /pengaduan/tujuan — pilihan tujuan (RW/RT) untuk form buat pengaduan, mengikuti
   * rumah & jabatan pelapor. Tanpa @RequirePermission: cukup login, karena hasilnya aman
   * berupa daftar kosong untuk akun yang memang tidak punya izin membuat pengaduan.
   * Harus didaftarkan sebelum @Get(':id') supaya "tujuan" tidak ketangkep sebagai :id.
   */
  @Get('tujuan')
  getTujuanPilihan(@CurrentUser() user: AuthUser) {
    return this.pengaduanService.getTujuanPilihan(user);
  }

  @Get(':id')
  @RequirePermission('pengaduan', 'read')
  findOne(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.pengaduanService.findOne(ctx, id);
  }

  @Patch(':id/respond')
  @RequirePermission('pengaduan', 'respon')
  respond(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondPengaduanDto,
  ) {
    return this.pengaduanService.respond(ctx, id, dto);
  }
}
