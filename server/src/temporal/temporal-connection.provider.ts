import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Connection } from '@temporalio/client';

import type { TemporalConfig } from '../config/configuration';
import { OrchestratorUnavailableError } from './temporal.errors';

/**
 * Owns the gRPC connection to the Temporal service (S6).
 *
 * Connects on module init and closes on shutdown. The close matters: an open
 * gRPC connection keeps the Node process alive, so without it Ctrl-C hangs —
 * a genuinely unpleasant thing to discover during a live demo. Requires
 * app.enableShutdownHooks() in main.ts.
 */
@Injectable()
export class TemporalConnectionProvider implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TemporalConnectionProvider.name);

  private connection?: Connection;
  private client?: Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const cfg = this.config.getOrThrow<TemporalConfig>('temporal');

    this.logger.log(`Connecting to Temporal at ${cfg.address} (namespace: ${cfg.namespace})`);

    this.connection = await Connection.connect({
      address: cfg.address,
      // Temporal Cloud uses TLS plus an API key; the local dev server uses neither.
      ...(cfg.tls ? { tls: true } : {}),
      ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
    });

    this.client = new Client({
      connection: this.connection,
      namespace: cfg.namespace,
    });

    this.logger.log('Temporal connection established');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connection) {
      this.logger.log('Closing Temporal connection');
      await this.connection.close();
      this.connection = undefined;
      this.client = undefined;
    }
  }

  getClient(): Client {
    if (!this.client) {
      throw new OrchestratorUnavailableError('client not initialised');
    }
    return this.client;
  }

  /** Real RPC against the service, not merely a check that an object exists. */
  async ping(): Promise<boolean> {
    try {
      if (!this.connection) return false;
      await this.connection.workflowService.getSystemInfo({});
      return true;
    } catch (err) {
      this.logger.warn(`Temporal ping failed: ${(err as Error).message}`);
      return false;
    }
  }
}
