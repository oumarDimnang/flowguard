import { Module } from '@nestjs/common';

import { OperationsModule } from '../operations/operations.module';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [OperationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookAuthGuard],
})
export class WebhooksModule {}
