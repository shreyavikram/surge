# SURGE

SURGE is an agro-defense readiness tool for the American food supply: a live map of threats, a
deterministic model of what each threat costs consumers, and a view of where relief could come from.
Eggs (2022 replay, 2024 calibration) and infant formula (2022) are the calibrated cases; every
commodity in the configuration flows through the same engine.

## Layout

- `packages/engine` — pure TypeScript engine: biology, price stage, welfare, mitigation, scenarios. Zero runtime dependencies, tested with vitest.
- `packages/config` — cited configuration: commodities, inputs, ERS ERR-139 demand system (extracted by `tools/extract-err139.py`), threat rules, regions, levers, plate, cases.
- `docs/economics` — literature review, methodology derivations, extracted source texts.
- `docs/superpowers` — design spec and implementation plans.
- `DECISIONS.md` — notable decisions and why.

## Run the tests

```bash
PATH="$HOME/.local/bin:$PATH" npm install && PATH="$HOME/.local/bin:$PATH" npm test
```

## Plans

1. Engine and config (this repo state).
2. Server, live feeds, snapshots, vetted gate, AI extraction layer.
3. Web app: map, watchlist, impact, plate, relief.
4. Simulator, briefs, deployment to a public URL.
