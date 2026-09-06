/** Consolidated commodity groups for the filter; a group selects all its commodities. */
export const COMMODITY_GROUPS: { id: string; label: string; ids: string[] }[] = [
  { id: 'fruits', label: 'Fruits', ids: ['apples', 'bananas', 'citrus'] },
  { id: 'vegetables', label: 'Vegetables', ids: ['lettuce', 'tomatoes', 'fresh-vegetables', 'potatoes'] },
  { id: 'grains', label: 'Grains and bakery', ids: ['bread', 'rice'] },
  { id: 'meat', label: 'Meat and poultry', ids: ['beef', 'pork', 'chicken', 'turkey'] },
  { id: 'eggs-dairy', label: 'Eggs and dairy', ids: ['eggs', 'milk', 'cheese'] },
  { id: 'pantry', label: 'Coffee, sugar, oils', ids: ['coffee', 'sugar', 'fats-oils'] },
  { id: 'formula', label: 'Infant formula', ids: ['infant-formula'] },
  { id: 'inputs', label: 'Farm inputs (feed, fertilizer, fuel)', ids: ['corn', 'soybeans', 'wheat', 'fertilizer', 'energy'] },
];
export function groupOf(id: string): string | undefined { return COMMODITY_GROUPS.find((g) => g.ids.includes(id))?.id; }
