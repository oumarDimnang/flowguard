import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';
import { Industry, Role } from './common/domain/tenancy';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OrganizationsService } from './organizations/organizations.service';
import { UsersModule } from './users/users.module';
import { UsersService } from './users/users.service';

/**
 * Only what seeding actually needs.
 *
 * Deliberately not AppModule: that pulls in the Temporal client, which means
 * creating two accounts would require a running orchestrator. Seeding is a
 * database operation and should work with nothing else up.
 */
@Module({
  imports: [ConfigModule, DatabaseModule, OrganizationsModule, UsersModule, AuthModule],
})
class SeedModule {}

/**
 * Seeds two organizations and five users.
 *
 * Idempotent: both repositories treat a duplicate key as "already exists" and
 * return the existing record, so this can be run against a database that has
 * already been seeded without producing errors or duplicates.
 *
 * Two organizations rather than one, deliberately. A single-tenant seed cannot
 * demonstrate the thing that matters most about this change — that one
 * organization genuinely cannot see another's operations — and a tenant
 * boundary nobody has looked at is a tenant boundary nobody has tested.
 *
 *   npm run seed
 */
async function seed(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['log', 'warn', 'error'] });

  const organizations = app.get(OrganizationsService);
  const users = app.get(UsersService);
  const auth = app.get(AuthService);

  const port = await organizations.create({
    slug: 'khalifa-port',
    name: 'Khalifa Bin Salman Port',
    industry: Industry.CONTAINER_TERMINAL,
  });

  const survey = await organizations.create({
    slug: 'gulf-aerial',
    name: 'Gulf Aerial Survey',
    industry: Industry.DRONE_OPERATIONS,
  });

  // Demo credentials. Fine for a sandbox, unacceptable anywhere real — the
  // password floor is 8 characters and these are exactly that.
  const password = await auth.hashPassword('flowguard');

  const accounts = [
    { org: port, email: 'ops@khalifa-port.test', name: 'Layla Al Mansoori', role: Role.OPERATOR },
    { org: port, email: 'auditor@khalifa-port.test', name: 'Tom Reyes', role: Role.VIEWER },
    { org: port, email: 'admin@khalifa-port.test', name: 'Noor Haddad', role: Role.ADMIN },
    { org: survey, email: 'ops@gulf-aerial.test', name: 'Priya Raman', role: Role.OPERATOR },
    { org: survey, email: 'admin@gulf-aerial.test', name: 'Sam Okafor', role: Role.ADMIN },
  ];

  for (const account of accounts) {
    await users.create({
      organizationId: account.org.id,
      email: account.email,
      name: account.name,
      role: account.role,
      passwordHash: password,
    });
    logger.log(`${account.email.padEnd(28)} ${account.role.padEnd(9)} ${account.org.name}`);
  }

  logger.log('');
  logger.log('All seeded accounts use the password: flowguard');
  logger.log('');
  logger.log('The pair worth demonstrating:');
  logger.log('  ops@khalifa-port.test      can dispatch');
  logger.log('  auditor@khalifa-port.test  same data, read only');
  logger.log('  ops@gulf-aerial.test       a different organization — sees none of it');

  await app.close();
}

void seed().catch((err: Error) => {
  new Logger('Seed').error(err.message, err.stack);
  process.exit(1);
});
