import { QualificationObservationSchema } from '../../src/schema.js';
import type { Value } from '../../src/decoder.js';
export type SuiteObservations=Value<typeof QualificationObservationSchema>;
/** Called once with actual F-O fixture/port/effect observations, after successful
 * assertions. Never manufacture zeros or infer useful actions from test names.
 * Canonical schema field order is part of the TAP observation gate contract.
 */
export function emitObservations(observations:SuiteObservations):void{
 console.log(JSON.stringify(QualificationObservationSchema.parse(observations)));
}
