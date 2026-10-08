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
import { CreatePengumumanDto } from './dto/create-pengumuman.dto';
import { UpdatePengumumanDto } from './dto/update-pengumuman.dto';
import { UpdateStatusPengumumanDto } from './dto/update-status-pengumuman.dto';
import { KeputusanPengajuanDto } from '../common/dto/pengajuan.dto';
import { pengumumanMulterOptions } from './pengumuman.multer';
import { PengumumanService } from './pengumuman.service';
import { Public } from '../auth/public.decorator';
import { Access, RequirePermission } from '../auth/permission.decorators';
import type { AccessContext } from '../auth/auth.types';

@Controller('pengumuman')
export class PengumumanController {
  constructor(private readonly pengumumanService: PengumumanService) {}

  @Post()
  @RequirePermission('pengumuman', 'create')
  @UseInterceptors(FileInterceptor('file', pengumumanMulterOptions))
  create(
    @Access() ctx: AccessContext,
    @Body() dto: CreatePengumumanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.pengumumanService.create(ctx, dto, file);
  }

  /** Halaman kelola. ?pengajuan=DIAJUKAN untuk antrean ACC RW. */
  @Get()
  @RequirePermission('pengumuman', 'read')
  findAll(
    @Access() ctx: AccessContext,
    @Query('pengajuan') pengajuan?: string,
    @Query('area') area?: string,
  ) {
    return this.pengumumanService.findAll(ctx, { pengajuan, area });
  }

  /** Umpan dashboard warga (sudah menghormati batas tampil). */
  @Get('feed')
  @RequirePermission('pengumuman', 'read')
  feed(@Access() ctx: AccessContext) {
    return this.pengumumanService.feed(ctx);
  }

  @Public()
  @Get('active')
  findActive(@Query('scope') scope?: string) {
    return this.pengumumanService.findActive(
      scope as 'aktif' | 'arsip' | undefined,
    );
  }

  @Get(':id')
  @RequirePermission('pengumuman', 'read')
  findOne(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.pengumumanService.findOne(ctx, id);
  }

  /** Sekre RT mengajukan pengumuman RT-nya agar tampil ke seluruh RW. */
  @Post(':id/ajukan')
  @RequirePermission('pengumuman', 'ajukan')
  ajukan(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.pengumumanService.ajukan(ctx, id);
  }

  /** Ketua/sekre RW menyetujui atau menolak pengajuan. */
  @Patch(':id/pengajuan')
  @RequirePermission('pengumuman', 'approve')
  putuskanPengajuan(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: KeputusanPengajuanDto,
  ) {
    return this.pengumumanService.putuskanPengajuan(ctx, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('pengumuman', 'update')
  updateStatus(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusPengumumanDto,
  ) {
    return this.pengumumanService.updateStatus(ctx, id, dto);
  }

  @Patch(':id')
  @RequirePermission('pengumuman', 'update')
  @UseInterceptors(FileInterceptor('file', pengumumanMulterOptions))
  update(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePengumumanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.pengumumanService.update(ctx, id, dto, file);
  }

  @Delete(':id')
  @RequirePermission('pengumuman', 'delete')
  remove(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.pengumumanService.remove(ctx, id);
  }
}
