import { IsString, Length } from 'class-validator';

/**
 * Why a job halted with its load committed.
 *
 * Required rather than optional, and free text rather than an enum. The reason
 * a crane stopped is the facility's to say — an emergency stop, a fault code, a
 * hold called by the deck — and it rides into the decision trail verbatim, so
 * the record explains why connectivity was held rather than only that it was.
 *
 * A closed enum here would force every real reason through the nearest
 * approximation, which is exactly the kind of lossy mapping an audit trail
 * cannot afford.
 */
export class SuspendJobDto {
  @IsString()
  @Length(2, 200)
  reason!: string;
}
