import type { EngineContext } from '../../src/types.js';

/** A two-good world (eggs and "other food") used by unit tests that need a context. */
export function minimalContext(): EngineContext {
  return {
    commodities: {
      eggs: {
        id: 'eggs', name: 'Eggs', group: 'eggs', unit: 'dozen',
        baseline: { annualQuantity: 5.725e9, retailPrice: 2.73, year: 2024, source: 'Fryar FC-2025-001 Table 1; population 340.1M (Census Vintage 2024)' },
        demand: { ownPrice: -0.228, range: [-0.11, -0.27], expenditure: 0.03, source: 'Fryar FC-2025-001; ERR-139 Table 6' },
        trade: { exportShare: 0.04, exportElasticity: -2, importShare: 0.01, source: 'Ferrier et al. 2024 Table 2; ERR-57 App. table 12 adjusted' },
        supply: { model: 'livestock', nationalInventory: 325e6, recoveryLagMinMonths: 5, recoveryLagMaxMonths: 12, producerOffset: 0.35, source: 'NASS Chickens and Eggs; APHIS restock criteria; Ferrier et al. 2024' },
        transmission: { passThrough: 0.7, lagMonths: 1, source: 'ERS price spreads; FRED vs AMS 2022 peak ratio' },
        plate: ['shell-eggs'],
      },
      other: {
        id: 'other', name: 'Other food', group: 'other', unit: 'usd',
        baseline: { annualQuantity: 1, retailPrice: 8.0e11, year: 2024, source: 'CEX 2024 food at home minus eggs (fixture)' },
        demand: { ownPrice: -0.5, range: [-0.3, -0.7], expenditure: 0.5, source: 'fixture' },
        trade: { exportShare: 0, exportElasticity: -1, importShare: 0.1, source: 'fixture' },
        supply: { model: 'crop', harvestMonth: 9, stocksToUse: 0.1, source: 'fixture' },
        transmission: { passThrough: 1, lagMonths: 0, source: 'fixture' },
        plate: [],
      },
    },
    inputs: {},
    demand: {
      source: 'fixture',
      items: [
        { id: 'eggs', label: 'Eggs', budgetShare: 0.0013, expenditureElasticity: 0.03 },
        { id: 'other', label: 'Other food', budgetShare: 0.08, expenditureElasticity: 0.5 },
      ],
      marshallian: [
        [-0.228, 0.01],
        [0.001, -0.5],
      ],
      standardErrors: [
        [0.06, 0.02],
        [0.01, 0.1],
      ],
    },
    threatTypes: {} as EngineContext['threatTypes'],
    regions: {},
    levers: [],
    plate: { nodes: [], edges: [], source: 'fixture' },
    population: { value: 340.1e6, year: 2024, source: 'Census Vintage 2024 via FRED POPTHM' },
    totalExpenditure: { value: 78535 * 134.6e6, year: 2024, source: 'CEX 2024 CXUTOTALEXPLB0101M × consumer units' },
  };
}
