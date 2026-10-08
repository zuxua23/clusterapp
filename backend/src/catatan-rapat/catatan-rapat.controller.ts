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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CatatanRapatService } from './catatan-rapat.service';
import { FileService } from '../common/file/file.service';
import {
  CreateCatatanRapatDto,
  UpdateCatatanRapatDto,
} from './dto/catatan-rapat.dto';
import { catatanRapatMulterOptions } from './catatan-rapat.multer';
import { Access, RequirePermission } from '../auth/permission.decorators';
import type { AccessContext } from '../auth/auth.types';

@Controller('catatan-rapat')
export class CatatanRapatController {
  constructor(
    private readonly catatanRapatService: CatatanRapatService,
    private readonly files: FileService,
  ) {}

  @Post()
  @RequirePermission('catatan_rapat', 'create')
  @UseInterceptors(FileInterceptor('file', catatanRapatMulterOptions))
  create(
    @Access() ctx: AccessContext,
    @Body() dto: CreateCatatanRapatDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.catatanRapatService.create(ctx, dto, file);
  }

  @Get()
  @RequirePermission('catatan_rapat', 'read')
  findAll(
    @Access() ctx: AccessContext,
    @Query('search') search?: string,
    @Query('area') area?: string,
  ) {
    return this.catatanRapatService.findAll(ctx, { search, area });
  }

  @Get(':id')
  @RequirePermission('catatan_rapat', 'read')
  findOne(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.catatanRapatService.findOne(ctx, id);
  }

  /** Unduh file notulen (butuh login + berada di wilayah yang sama). */
  @Get(':id/file')
  @RequirePermission('catatan_rapat', 'read')
  async file(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    await this.files.kirim(res, await this.catatanRapatService.fileId(ctx, id));
  }

  @Patch(':id')
  @RequirePermission('catatan_rapat', 'update')
  @UseInterceptors(FileInterceptor('file', catatanRapatMulterOptions))
  update(
    @Access() ctx: AccessContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatatanRapatDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.catatanRapatService.update(ctx, id, dto, file);
  }

  @Delete(':id')
  @RequirePermission('catatan_rapat', 'delete')
  remove(@Access() ctx: AccessContext, @Param('id', ParseIntPipe) id: number) {
    return this.catatanRapatService.remove(ctx, id);
  }
}
