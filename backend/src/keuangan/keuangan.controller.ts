import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { KeuanganService } from './keuangan.service';
import { FileService } from '../common/file/file.service';
import { CreateKasDto } from './dto/create-kas.dto';
import { ExportKasDto } from './dto/export-kas.dto';
import { UpdateKasDto } from './dto/update-kas.dto';
import { keuanganMulterOptions } from './keuangan.multer';
import { Access, RequirePermission } from '../auth/permission.decorators';
import type { AccessContext } from '../auth/auth.types';

@Controller('keuangan')
export class KeuanganController {
  constructor(
    private readonly keuanganService: KeuanganService,
    private readonly files: FileService,
  ) {}

  /** POST /keuangan — Catat transaksi kas manual (bukti opsional) */
  @Post()
  @RequirePermission('keuangan', 'create')
  @UseInterceptors(FileInterceptor('bukti', keuanganMulterOptions))
  create(
    @Access() ctx: AccessContext,
    @Body() dto: CreateKasDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.keuanganService.create(ctx, dto, file);
  }

  /** GET /keuangan/ringkasan — Ringkasan pemasukan otomatis + kas manual */
  @Get('ringkasan')
  @RequirePermission('keuangan', 'read')
  getRingkasan(
    @Access() ctx: AccessContext,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('area') area?: string,
  ) {
    return this.keuanganService.getRingkasan(ctx, { dari, sampai, area });
  }

  /** GET /keuangan — Riwayat transaksi kas manual dengan filter opsional */
  @Get()
  @RequirePermission('keuangan', 'read')
  findAll(
    @Access() ctx: AccessContext,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('tipe') tipe?: string,
    @Query('kategori') kategori?: string,
    @Query('search') search?: string,
    @Query('area') area?: string,
  ) {
    return this.keuanganService.findAll(ctx, {
      dari,
      sampai,
      tipe,
      kategori,
      search,
      area,
    });
  }

  /** GET /keuangan/export — Unduh Riwayat Kas (CSV/XLSX + saldo berjalan). Wajib di atas ':id'. */
  @Get('export')
  @RequirePermission('keuangan', 'read')
  async export(
    @Access() ctx: AccessContext,
    @Query() dto: ExportKasDto,
    @Res() res: Response,
  ) {
    const file = await this.keuanganService.exportRiwayat(ctx, dto);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    res.send(file.buffer);
  }

  /** GET /keuangan/:id/bukti — unduh bukti file transaksi (butuh login + scope area). Wajib di atas ':id'. */
  @Get(':id/bukti')
  @RequirePermission('keuangan', 'read')
  async bukti(
    @Access() ctx: AccessContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.files.kirim(
      res,
      await this.keuanganService.fileIdBukti(ctx, id),
    );
  }

  /** GET /keuangan/:id — Detail satu transaksi */
  @Get(':id')
  @RequirePermission('keuangan', 'read')
  findOne(@Access() ctx: AccessContext, @Param('id') id: string) {
    return this.keuanganService.findOne(ctx, id);
  }

  /** PATCH /keuangan/:id — Perbarui transaksi */
  @Patch(':id')
  @RequirePermission('keuangan', 'update')
  @UseInterceptors(FileInterceptor('bukti', keuanganMulterOptions))
  update(
    @Access() ctx: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateKasDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.keuanganService.update(ctx, id, dto, file);
  }

  /** DELETE /keuangan/:id — Hapus transaksi */
  @Delete(':id')
  @RequirePermission('keuangan', 'delete')
  remove(@Access() ctx: AccessContext, @Param('id') id: string) {
    return this.keuanganService.remove(ctx, id);
  }
}
