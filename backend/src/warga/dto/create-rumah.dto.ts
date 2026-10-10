import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Matches,
} from 'class-validator';
import { RT, StatusRumah } from '@prisma/client';
import { Type } from 'class-transformer';
import { BLOK_RUMAH_MESSAGE, BLOK_RUMAH_REGEX } from '../../common/helpers';

export class CreateRumahDto {
  @IsString()
  @IsNotEmpty()
  @Matches(BLOK_RUMAH_REGEX, { message: BLOK_RUMAH_MESSAGE })
  blokRumah!: string;

  @IsEnum(RT)
  @IsNotEmpty()
  rt!: RT;

  /** Default: ada userId -> DIHUNI_TETAP, tanpa userId -> KOSONG. */
  @IsOptional()
  @IsEnum(StatusRumah)
  status?: StatusRumah;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;
}
