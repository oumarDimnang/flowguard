/** Thrown by the repository when a slug is already in use. */
export class SlugTakenError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`An organization already exists with slug '${slug}'`);
    this.name = 'SlugTakenError';
    this.slug = slug;
  }
}
