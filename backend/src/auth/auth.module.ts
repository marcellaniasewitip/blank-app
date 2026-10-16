import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { TokensService } from './tokens.service';
import { OtpService } from './otp.service';
import { UserAuthService } from './user-auth.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminPermissionsCache } from './admin-permissions.cache';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    TokensService,
    OtpService,
    UserAuthService,
    AdminAuthService,
    AdminPermissionsCache,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokensService, AdminPermissionsCache, AdminAuthService],
})
export class AuthModule {}
