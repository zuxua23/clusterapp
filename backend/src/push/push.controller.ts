import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PushService } from './push.service';
import { SubscribePushDto, UnsubscribePushDto } from './dto/subscribe-push.dto';
import { Public } from '../auth/public.decorator';

interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}

type AuthedRequest = Request & { user: JwtPayload };

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Public()
  @Get('vapid-public-key')
  vapidPublicKey() {
    return this.pushService.vapidPublicKey();
  }

  @Post('subscribe')
  subscribe(@Body() dto: SubscribePushDto, @Req() req: AuthedRequest) {
    return this.pushService.subscribe(
      req.user.sub,
      dto,
      req.headers['user-agent'],
    );
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: UnsubscribePushDto, @Req() req: AuthedRequest) {
    return this.pushService.unsubscribe(req.user.sub, dto.endpoint);
  }
}
