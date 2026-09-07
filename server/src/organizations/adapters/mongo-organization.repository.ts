import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type { Organization, OrganizationCreate } from '../domain/organization';
import { OrganizationRepository } from '../ports/organization.repository';
import { OrganizationDocument, OrganizationEntity } from '../schemas/organization.schema';

/** Mongo duplicate-key error. */
const DUPLICATE_KEY = 11000;

@Injectable()
export class MongoOrganizationRepository extends OrganizationRepository {
  constructor(
    @InjectModel(OrganizationEntity.name)
    private readonly model: Model<OrganizationDocument>,
  ) {
    super();
  }

  async findById(id: string): Promise<Organization | null> {
    // An id that is not a valid ObjectId would throw rather than miss, and a
    // malformed id in a session cookie should be a clean "no such tenant".
    if (!this.model.base.isValidObjectId(id)) return null;

    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const doc = await this.model.findOne({ slug }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findAll(): Promise<Organization[]> {
    const docs = await this.model.find().sort({ name: 1 }).lean().exec();
    return docs.map((doc) => this.toDomain(doc));
  }

  async create(organization: OrganizationCreate): Promise<Organization> {
    try {
      const created = await this.model.create(organization);
      return this.toDomain(created.toObject());
    } catch (err) {
      // Seeding runs on every boot in development; a taken slug means the
      // tenant already exists, which is the desired end state either way.
      if ((err as { code?: number }).code === DUPLICATE_KEY) {
        const existing = await this.findBySlug(organization.slug);
        if (existing) return existing;
      }
      throw err;
    }
  }

  private toDomain(doc: OrganizationEntity & { _id?: unknown; createdAt?: Date }): Organization {
    return {
      id: String(doc._id),
      slug: doc.slug,
      name: doc.name,
      industry: doc.industry,
      createdAt: doc.createdAt ?? new Date(0),
    };
  }
}
