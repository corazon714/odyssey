/**
 * What a node offers a traveller, as a 6-bit mask over `SERVICE_KINDS` index order.
 *
 * A mask rather than a string array because ~1,200 nodes each carry one: six short strings is
 * ~40 bytes per node in the shipped JSON against one small integer. It also makes "how many
 * services" a popcount rather than a length, which is what the montage dullness comparator
 * needs (ADR 0026 Decision 4).
 *
 * The mask is DERIVED, never authored. ADR 0024 Decision 4 publishes the table mapping
 * `(type, populationBand)` to services, because GeoNames carries no services data and an
 * underived one would be an unreviewable judgement about a real place. Every input to that
 * table is settlement size or physical type.
 */
export const SERVICE_KINDS = ['fuel', 'lodging', 'medical', 'market', 'transit', 'repair'] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number];

export function serviceMask(services: readonly ServiceKind[]): number {
  let mask = 0;
  for (const service of services) {
    const bit = SERVICE_KINDS.indexOf(service);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

export function hasService(mask: number, service: ServiceKind): boolean {
  const bit = SERVICE_KINDS.indexOf(service);
  return bit >= 0 && (mask & (1 << bit)) !== 0;
}

/** Popcount over the six defined bits, so a wider mask cannot inflate the count. */
export function serviceCount(mask: number): number {
  let count = 0;
  for (let bit = 0; bit < SERVICE_KINDS.length; bit += 1) {
    if ((mask & (1 << bit)) !== 0) count += 1;
  }
  return count;
}

export function servicesOf(mask: number): readonly ServiceKind[] {
  return SERVICE_KINDS.filter((_, bit) => (mask & (1 << bit)) !== 0);
}
