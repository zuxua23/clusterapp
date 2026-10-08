import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WargaService } from './warga.service';
import { CreateWargaDto } from './dto/create-warga.dto';
import { UpdateWargaDto } from './dto/update-warga.dto';
import { CreateRumahDto } from './dto/create-rumah.dto';
import { UpdateRumahDto } from './dto/update-rumah.dto';
import { DaftarMandiriDto } from './dto/daftar-mandiri.dto';
import { SetujuiPendaftaranDto } from './dto/setujui-pendaftaran.dto';
import { TolakPendaftaranDto } from './dto/tolak-pendaftaran.dto';
import { buktiMulterOptions } from './bukti.multer';
import { Access, RequirePermission } from '../auth/permission.decorators';
import { Public } from '../auth/public.decorator';
import type { AccessContext } from '../auth/auth.types';

@Controller('warga')
export class WargaController {
  constructor(private readonly wargaService: WargaService) {}

  // -------------------------------------------------------
  // USER / WARGA CRUD — pengurus RT untuk RT-nya, RW/admin sesuai scope
  // -------------------------------------------------------
  @Post()
  @RequirePermission('warga', 'create')
  create(@Access() ctx: AccessContext, @Body() dto: CreateWargaDto) {
    return this.wargaService.create(ctx, dto);
  }

  @Get()
  @RequirePermission('warga', 'read')
  findAll(
    @Access() ctx: AccessContext,
    @Query('search') search?: string,
    @Query('rt') rt?: string,
  ) {
    return this.wargaService.findAll(ctx, { search, rt });
  }

  /** Dropdown: semua warga (sesuai scope) untuk form Tambah/Edit Rumah */
  @Get('users')
  @RequirePermission('warga', 'read')
  findAllUsers(@Access() ctx: AccessContext) {
    return this.wargaService.findAllUsers(ctx);
  }

  // -------------------------------------------------------
  // RUMAH / BLOK RUMAH
  // -------------------------------------------------------
  @Get('rumah/list')
  @RequirePermission('rumah', 'read')
  findAllRumah(@Access() ctx: AccessContext) {
    return this.wargaService.findAllRumah(ctx);
  }

  @Post('rumah')
  @RequirePermission('rumah', 'create')
  createRumah(@Access() ctx: AccessContext, @Body() dto: CreateRumahDto) {
    return this.wargaService.createRumah(ctx, dto);
  }

  @Patch('rumah/:id')
  @RequirePermission('rumah', 'update')
  updateRumah(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRumahDto,
  ) {
    return this.wargaService.updateRumah(ctx, id, dto);
  }

  @Delete('rumah/:id')
  @RequirePermission('rumah', 'delete')
  removeRumah(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.wargaService.removeRumah(ctx, id);
  }

  // -------------------------------------------------------
  // PORTAL WARGA — tagihan & pembayaran (scope OWN untuk warga)
  // -------------------------------------------------------

  /** GET /warga/portal/rumah/:userId — daftar rumah milik user */
  @Get('portal/rumah/:userId')
  @RequirePermission('ipl', 'read')
  getRumahByUser(
    @Access() ctx: AccessContext,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.wargaService.getRumahByUser(ctx, userId);
  }

  /** GET /warga/portal/tagihan/user/:userId — tagihan IPL gabungan semua rumah milik user */
  @Get('portal/tagihan/user/:userId')
  @RequirePermission('ipl', 'read')
  getTagihanByUser(
    @Access() ctx: AccessContext,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('bulan') bulan?: string,
    @Query('tahun') tahun?: string,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.wargaService.getTagihanByUser(ctx, userId, {
      bulan,
      tahun,
      dari,
      sampai,
      status,
      search,
    });
  }

  /** GET /warga/portal/tagihan/:rumahId — tagihan IPL per rumah */
  @Get('portal/tagihan/:rumahId')
  @RequirePermission('ipl', 'read')
  getTagihanByRumah(
    @Access() ctx: AccessContext,
    @Param('rumahId', ParseIntPipe) rumahId: number,
  ) {
    return this.wargaService.getTagihanByRumah(ctx, rumahId);
  }

  /** POST /warga/portal/bayar — upload bukti pembayaran (selalu atas nama user yang login) */
  @Post('portal/bayar')
  @RequirePermission('ipl', 'bayar')
  @UseInterceptors(FileInterceptor('file', buktiMulterOptions))
  uploadBuktiPembayaran(
    @Access() ctx: AccessContext,
    @Body() body: { idIpl: string; nominal?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.wargaService.uploadBuktiPembayaran(ctx, {
      idIpl: +body.idIpl,
      nominal: body.nominal ? +body.nominal : undefined,
      bukti: file,
    });
  }

  // -------------------------------------------------------
  // REGISTRASI MANDIRI (Bagian 3) — daftar & rumah-kosong publik (tanpa token);
  // pendaftaran/* butuh permission warga.approve_registrasi (Ketua/Sekre RT).
  // -------------------------------------------------------

  /** Publik: blok rumah kosong di satu RT, untuk dropdown form register. */
  @Public()
  @Get('rumah-kosong')
  getRumahKosong(@Query('rt') rt: string) {
    return this.wargaService.getRumahKosong(rt);
  }

  /** Publik: warga daftar akun sendiri, masuk status Menunggu Persetujuan. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('daftar')
  daftarMandiri(@Body() dto: DaftarMandiriDto) {
    return this.wargaService.daftarMandiri(dto);
  }

  /** Daftar pendaftaran mandiri yang menunggu persetujuan di area pengurus ini. */
  @Get('pendaftaran')
  @RequirePermission('warga', 'approve_registrasi')
  getPendaftaran(
    @Access() ctx: AccessContext,
    @Query('status') status?: string,
  ) {
    return this.wargaService.getPendaftaran(ctx, status);
  }

  @Patch('pendaftaran/:id/setuju')
  @RequirePermission('warga', 'approve_registrasi')
  setujuiPendaftaran(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto?: SetujuiPendaftaranDto,
  ) {
    return this.wargaService.setujuiPendaftaran(ctx, id, dto?.status);
  }

  @Patch('pendaftaran/:id/tolak')
  @RequirePermission('warga', 'approve_registrasi')
  tolakPendaftaran(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TolakPendaftaranDto,
  ) {
    return this.wargaService.tolakPendaftaran(ctx, id, dto.alasan);
  }

  // -------------------------------------------------------
  // Dengan :id — ditaruh paling bawah agar tidak menimpa route statis di atas
  // -------------------------------------------------------
  @Get(':id')
  @RequirePermission('warga', 'read')
  findOne(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.wargaService.findOne(ctx, id);
  }

  @Patch(':id')
  @RequirePermission('warga', 'update')
  update(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWargaDto,
  ) {
    return this.wargaService.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermission('warga', 'delete')
  remove(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.wargaService.remove(ctx, id);
  }

  /** Pengurus RT membuatkan password sementara untuk warga yang lupa password. */
  @Post(':id/reset-password')
  @RequirePermission('warga', 'reset_password')
  resetPassword(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.wargaService.resetPassword(ctx, id);
  }
}
