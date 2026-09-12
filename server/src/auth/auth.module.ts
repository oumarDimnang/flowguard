import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleGuard } from './guards/login-throttle.guard';
import { LoginRateLimiter } from './login-rate-limiter';

@Module({
  imports: [UsersModule, OrganizationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    // A factory, because the limiter's constructor parameters (window length
    // and clock) exist for the tests and are not injectable tokens.
    { provide: LoginRateLimiter, useFactory: () => new LoginRateLimiter() },
    LoginThrottleGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
