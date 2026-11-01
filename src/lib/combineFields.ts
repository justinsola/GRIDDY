import { qsfEmbeddedFields, QualtricsQsfItem } from "./qualtricsExport";

/**
 * Find two questions of a multi-question survey that would write to the same
 * embedded-data field, where the later one's answers would overwrite the
 * earlier one's. Questions are told apart by position, not by name, because
 * two saved surveys can share a name. Returns a message for the researcher,
 * or null when every field is unique.
 */
export function findFieldCollision(items: QualtricsQsfItem[], names: string[]): string | null {
  const claimedBy = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    for (const field of qsfEmbeddedFields(items[i])) {
      const first = claimedBy.get(field);
      if (first !== undefined && first !== i) {
        const firstName = names[first] || `Question ${first + 1}`;
        const secondName = names[i] || `Question ${i + 1}`;
        return `Questions ${first + 1} ("${firstName}") and ${i + 1} ("${secondName}") both write to the field "${field}". Give one of them a different data field name.`;
      }
      claimedBy.set(field, i);
    }
  }
  return null;
}
