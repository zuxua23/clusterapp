import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateKegiatanDto } from './dto/create-kegiatan.dto';
import { UpdateKegiatanDto } from './dto/update-kegiatan.dto';
import { UpdateStatusKegiatanDto } from './dto/update-status-kegiatan.dto';
import { KeputusanPengajuanDto } from '../common/dto/pengajuan.dto';
import { kegiatanMulterOptions } from './kegiatan.multer';
import { KegiatanService } from './kegiatan.service';
import { Public } from '../auth/public.decorator';
import { Access, RequirePermission } from '../auth/permission.decorators';
import type { AccessContext } from '../auth/auth.types';

@Controller('kegiatan')
export class KegiatanController {
  constructor(private readonly kegiatanService: KegiatanService) {}

  @Post()
  @RequirePermission('kegiatan', 'create')
  @UseInterceptors(FileInterceptor('file', kegiatanMulterOptions))
  create(
    @Access() ctx: AccessContext,
    @Body() dto: CreateKegiatanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.kegiatanService.create(ctx, dto, file);
  }

  /** Halaman kelola. ?pengajuan=DIAJUKAN untuk antrean ACC RW. */
  @Get()
  @RequirePermission('kegiatan', 'read')
  findAll(
    @Access() ctx: AccessContext,
    @Query('pengajuan') pengajuan?: string,
    @Query('area') area?: string,
  ) {
    return this.kegiatanService.findAll(ctx, { pengajuan, area });
  }

  /** Umpan dashboard warga (sudah menghormati batas tampil). */
  @Get('feed')
  @RequirePermission('kegiatan', 'read')
  feed(@Access() ctx: AccessContext) {
    return this.kegiatanService.feed(ctx);
  }

  @Public()
  @Get('active')
  findActive(@Query('scope') scope?: string) {
    return this.kegiatanService.findActive(
      scope as 'aktif' | 'arsip' | undefined,
    );
  }

  /** Portofolio 5 tahun untuk landing page, per tahun. */
  @Public()
  @Get('portofolio')
  portofolio() {
    return this.kegiatanService.portofolio();
  }

  @Get(':id')
  @RequirePermission('kegiatan', 'read')
  findOne(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.kegiatanService.findOne(ctx, id);
  }

  /** Sekre RT mengajukan kegiatan RT-nya agar tampil ke seluruh RW. */
  @Post(':id/ajukan')
  @RequirePermission('kegiatan', 'ajukan')
  ajukan(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.kegiatanService.ajukan(ctx, id);
  }

  /** Ketua/sekre RW menyetujui atau menolak pengajuan. */
  @Patch(':id/pengajuan')
  @RequirePermission('kegiatan', 'approve')
  putuskanPengajuan(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: KeputusanPengajuanDto,
  ) {
    return this.kegiatanService.putuskanPengajuan(ctx, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('kegiatan', 'update')
  updateStatus(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusKegiatanDto,
  ) {
    return this.kegiatanService.updateStatus(ctx, id, dto);
  }

  @Patch(':id')
  @RequirePermission('kegiatan', 'update')
  @UseInterceptors(FileInterceptor('file', kegiatanMulterOptions))
  update(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKegiatanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.kegiatanService.update(ctx, id, dto, file);
  }

  @Delete(':id')
  @RequirePermission('kegiatan', 'delete')
  remove(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.kegiatanService.remove(ctx, id);
  }
}
