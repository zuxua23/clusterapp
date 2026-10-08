import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import multer, { memoryStorage } from 'multer';
import * as path from 'node:path';

/**
 * Opsi multer bersama: file ditahan di memori (file.buffer) lalu disimpan ke database
 * lewat FileService, bukan ditulis ke folder uploads/.
 */
export function buatMulterOptions(
  ekstensi: RegExp,
  pesanTipe: string,
  maksMb: number,
) {
  return {
    storage: memoryStorage(),
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      callback: multer.FileFilterCallback,
    ) => {
      if (!ekstensi.test(path.extname(file.originalname))) {
        return callback(new BadRequestException(pesanTipe));
      }
      callback(null, true);
    },
    limits: { fileSize: maksMb * 1024 * 1024 },
  };
}
