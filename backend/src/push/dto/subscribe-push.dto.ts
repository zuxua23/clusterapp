import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class SubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  // Selalu ikut terkirim dari PushSubscription.toJSON() milik browser (biasanya null) —
  // tidak dipakai di sini, tapi harus dideklarasikan supaya tidak ditolak ValidationPipe
  // (forbidNonWhitelisted: true menolak seluruh request kalau ada field tak dikenal).
  @IsOptional()
  expirationTime?: number | string | null;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}
