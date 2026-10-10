import { IsEnum, IsOptional } from 'class-validator';
import { StatusRumah } from '@prisma/client';

/** Status hunian awal saat pendaftaran disetujui (KOSONG tetap ditagih IPL, masuk kas RT). */
export class SetujuiPendaftaranDto {
  @IsOptional()
  @IsEnum(StatusRumah)
  status?: StatusRumah;
}
