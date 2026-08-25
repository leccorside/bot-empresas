import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiController } from './controller';
import { ApiService } from './service';
import { AuthGuard } from './security';

@Global()
@Module({ controllers:[ApiController], providers:[ApiService,{provide:APP_GUARD,useClass:AuthGuard}] })
export class AppModule {}
