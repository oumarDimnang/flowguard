import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type { User, UserCreate, UserWithSecret } from '../domain/user';
import { EmailTakenError } from '../domain/user.errors';
import { UserRepository } from '../ports/user.repository';
import { UserDocument, UserEntity } from '../schemas/user.schema';

const DUPLICATE_KEY = 11000;

@Injectable()
export class MongoUserRepository extends UserRepository {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly model: Model<UserDocument>,
  ) {
    super();
  }

  /**
   * The only read that returns the hash.
   *
   * `passwordHash` is `select: false` on the schema, so it has to be asked for
   * by name — which means a forgotten projection somewhere else cannot leak it
   * into a response.
   */
  async findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    const doc = await this.model
      .findOne({ email: normalise(email) })
      .select('+passwordHash')
      .lean()
      .exec();

    if (!doc) return null;
    return { ...this.toDomain(doc), passwordHash: doc.passwordHash };
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.model
      .findOne({ email: normalise(email) })
      .lean()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findById(id: string): Promise<User | null> {
    if (!this.model.base.isValidObjectId(id)) return null;

    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    const docs = await this.model.find({ organizationId }).sort({ name: 1 }).lean().exec();
    return docs.map((doc) => this.toDomain(doc));
  }

  async create(user: UserCreate): Promise<User> {
    try {
      const created = await this.model.create(user);
      return this.toDomain(created.toObject());
    } catch (err) {
      // The unique index is the real guard against a race between two
      // simultaneous sign-ups; a pre-check in the service is only a courtesy.
      if ((err as { code?: number }).code === DUPLICATE_KEY) {
        throw new EmailTakenError(normalise(user.email));
      }
      throw err;
    }
  }

  async recordLogin(id: string, at: Date): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { lastLoginAt: at } }).exec();
  }

  private toDomain(doc: UserEntity & { _id?: unknown; createdAt?: Date }): User {
    return {
      id: String(doc._id),
      organizationId: doc.organizationId,
      email: doc.email,
      name: doc.name,
      role: doc.role,
      createdAt: doc.createdAt ?? new Date(0),
      lastLoginAt: doc.lastLoginAt,
    };
  }
}

/** Matches the schema's own `lowercase: true, trim: true`, so lookups agree with writes. */
function normalise(email: string): string {
  return email.toLowerCase().trim();
}
