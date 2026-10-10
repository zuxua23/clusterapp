import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FileService } from '../common/file/file.service';
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
  constructor(
    private readonly pengaduanService: PengaduanService,
    private readonly files: FileService,
  ) {}

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

  /** GET /pengaduan/tujuan — pilihan tujuan form pengaduan. Harus di atas @Get(':id'). */
  @Get('tujuan')
  getTujuanPilihan(@CurrentUser() user: AuthUser) {
    return this.pengaduanService.getTujuanPilihan(user);
  }

  @Get(':id/foto')
  @RequirePermission('pengaduan', 'read')
  async foto(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    await this.files.kirim(
      res,
      await this.pengaduanService.fileIdFoto(ctx, id),
    );
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
