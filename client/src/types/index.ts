/**
 * Hand-mirrored server contracts.
 *
 * Nothing links these to the NestJS types at compile time — the server file
 * each one mirrors is named at the top of every module. When a server DTO
 * changes, this directory is the second place to change.
 */
export * from './auth';
export * from './common';
export * from './decision';
export * from './facility';
export * from './live';
export * from './metrics';
export * from './operation';
export * from './reasoning';
export * from './simulator';
