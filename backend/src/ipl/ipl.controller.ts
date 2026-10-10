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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { IplService } from './ipl.service';
import { FileService } from '../common/file/file.service';
import { GenerateIplDto } from './dto/generate-ipl.dto';
import { UpdateIplDto } from './dto/update-ipl.dto';
import { KonfirmasiIplDto } from './dto/konfirmasi-ipl.dto';
import {
  Access,
  CurrentUser,
  RequirePermission,
} from '../auth/permission.decorators';
import type { AccessContext, AuthUser } from '../auth/auth.types';

@Controller('ipl')
export class IplController {
  constructor(
    private readonly iplService: IplService,
    private readonly files: FileService,
  ) {}

  /** POST /ipl/generate — Generate tagihan massal untuk rumah aktif di RT pembuat */
  @Post('generate')
  @RequirePermission('ipl', 'generate')
  generateTagihan(@Access() ctx: AccessContext, @Body() dto: GenerateIplDto) {
    return this.iplService.generateTagihan(ctx, dto);
  }

  /** GET /ipl/dashboard-stats — Statistik ringkasan untuk widget dashboard */
  @Get('dashboard-stats')
  @RequirePermission('ipl', 'read')
  getDashboardStats(
    @Access() ctx: AccessContext,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('rt') rt?: string,
  ) {
    return this.iplService.getDashboardStats(ctx, { dari, sampai, rt });
  }

  /** GET /ipl/rekap-rt — Rekap terkumpul & disetor per RT (tampilan RW, ikut filter aktif) */
  @Get('rekap-rt')
  @RequirePermission('ipl', 'read')
  rekapPerRt(
    @Access() ctx: AccessContext,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('status') status?: string,
    @Query('rt') rt?: string,
  ) {
    return this.iplService.rekapPerRt(ctx, { dari, sampai, status, rt });
  }

  /** GET /ipl — Daftar tagihan IPL dengan filter opsional */
  @Get()
  @RequirePermission('ipl', 'read')
  findAll(
    @Access() ctx: AccessContext,
    @Query('bulan') bulan?: string,
    @Query('tahun') tahun?: string,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('rt') rt?: string,
  ) {
    return this.iplService.findAll(ctx, {
      bulan,
      tahun,
      dari,
      sampai,
      status,
      search,
      rt,
    });
  }

  /** GET /ipl/pembayaran/:id/bukti — Unduh bukti transfer (butuh login + scope sesuai). */
  @Get('pembayaran/:id/bukti')
  @RequirePermission('ipl', 'read')
  async bukti(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    await this.files.kirim(res, await this.iplService.fileIdBukti(ctx, id));
  }

  /** PATCH /ipl/konfirmasi/:pembayaranId — butuh `ipl.konfirmasi` ATAU `ipl.konfirmasi_pengurus`, dicek di service. */
  @Patch('konfirmasi/:pembayaranId')
  konfirmasiPembayaran(
    @CurrentUser() user: AuthUser,
    @Param('pembayaranId', ParseIntPipe) pembayaranId: number,
    @Body() dto: KonfirmasiIplDto,
  ) {
    return this.iplService.konfirmasiPembayaran(user, pembayaranId, dto);
  }

  /** PATCH /ipl/:id — Koreksi nominal satu tagihan (hanya yang belum lunas) */
  @Patch(':id')
  @RequirePermission('ipl', 'update')
  update(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIplDto,
  ) {
    return this.iplService.update(ctx, id, dto);
  }

  /** DELETE /ipl/:id — Hapus satu tagihan yang belum ada pembayarannya */
  @Delete(':id')
  @RequirePermission('ipl', 'delete')
  remove(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.iplService.remove(ctx, id);
  }
}
