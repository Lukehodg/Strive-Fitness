# Strive adaptive training intelligence

Planning proposal, 29 September 2026. No models, dependencies or integrations installed by this document.

Implementation follow-up: see [Coach connection plan](COACH_CONNECTION_PLAN.md) for the approved concept's screen/API mapping, updated source inventory, proposal lifecycle and delivery backlog. It accounts for the readiness and wearable code added after this initial review.

## Product decision

Build a hybrid coach: structured health features, a constrained programme planner, a learned response predictor, and an optional language model for explanations. Start with adults seeking general fitness/strength. Rehabilitation, diagnosis, medication changes and elite performance optimisation require separate validation and are outside the initial scope.

The first useful release does not require training a foundation model. Build the decision pipeline and collect outcome data first; train a small model when there is enough representative evidence to evaluate it. Repositories supply software and exercise knowledge, but do not by themselves supply examples of optimal personalised workouts.

## Existing foundation and integration points

Inspected the local working tree, which has substantial work in progress. The README is behind some source changes. Existing source includes account-owned workout templates, session snapshots, sets and RPE in `server/training.ts`; health metrics, meals and daily check-ins in `shared/schema.ts`; and WHOOP/Oura provider-client code in `server/wearable-providers.ts`. This review does not establish that live provider connections work. The generation endpoint in `server/routes.ts` is a replacement point, not an implemented learning system.

Proposed additions, keeping the TypeScript backend and native mobile app:

| Location | Responsibility |
| --- | --- |
| `server/wearable-providers.ts` and ingestion worker | Extend and verify current cloud connectors, token renewal, retries, deletions and source provenance. |
| `mobile/src/health/` | Proposed permission-scoped HealthKit and Health Connect adapters. |
| `server/intelligence/features.ts` | Reproducible features using only information available at the recommendation time. |
| `server/intelligence/planner.ts` | Build weekly programmes and today's feasible exercise candidates. |
| `server/intelligence/constraints.ts` | Enforce equipment, time, exclusions, approved progression and symptom policies. |
| `server/intelligence/recommendations.ts` | Versioned proposal, reasons, acceptance and feedback lifecycle. |
| `server/intelligence/explanations.ts` | Optional model-generated wording from validated structured decisions; template fallback. |
| `ml/` | Later Python training, evaluation and model export; independently deployable inference only when needed. |
| `shared/schema.ts` plus additive migrations | Profiles, observations, programme versions, decision snapshots, outcomes and training consent. |

## Decision flow

1. **Collect relevant inputs:** goals, experience, equipment, days/week, available minutes, exercise preferences and declared limitations; completed sets/reps/load/RPE; sleep, resting heart rate, HRV and activity when available; energy, soreness, pain/illness check-in. Treat nutrition logs as incomplete unless coverage is known. Regimen records are not instructions to alter doses or infer medical clearance.
2. **Normalise:** retain source record ID, device, unit, metric definition, timestamps, local day, ingestion time, quality and revision. Resolve overlapping workouts and duplicate device records. Preserve provider scores separately and keep different HRV measurement methods distinct.
3. **Build personal context:** recent workload by exercise/movement, time since related sessions, performance trend, sleep trend, source freshness and missingness. Use an initial 2–4-week baseline window as a beta hypothesis, not a validated physiological threshold. Support users with no wearable or insufficient history.
4. **Create the programme:** select a trainer-reviewed template matching goal, experience, availability and equipment. Plan an initial four-week block with review points. Include progression and recovery rules rather than selecting unrelated workouts each day.
5. **Adapt today's session:** choose among approved alternatives such as keep, shorten, reduce effort/volume, substitute or rest. Hard exclusions and concerning user-reported symptoms take priority. Exact thresholds and escalation wording need professional review before release. A wearable score alone never establishes that training is safe.
6. **Validate and explain:** return exercise IDs, order, sets, rep ranges, effort target, rest and estimated duration, plus reasons and data quality. Include warm-up and rest in time estimates. Use only catalogue exercises. Missing load history means an effort-guided starting prescription rather than an invented precise weight.
7. **Review and log:** show changes against the original programme, let the user accept or override, then create the existing session snapshot. Late syncs never silently rewrite an active workout.
8. **Learn:** collect actual completion, performance, effort, substitutions, override reason and subsequent check-in. Missing feedback remains missing, not a successful outcome.

## Repository shortlist

Sources were inspected at planning time; pin and audit a specific version before adoption. Source-code, dataset, media and model-weight rights must be checked separately.

| Repository | Proposed role | Priority and limitation |
| --- | --- | --- |
| [kingstinct/react-native-healthkit](https://github.com/kingstinct/react-native-healthkit) | Native iOS health ingestion into normalised observations. | Phase 2. Supports Expo development builds; not Expo Go. Verify compatibility with the app's exact SDK. |
| [matinzd/react-native-health-connect](https://github.com/matinzd/react-native-health-connect) | Native Android health ingestion. | Phase 2. Native build and platform permissions needed. Connector, not training data. |
| [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) | Seed exercise catalogue and retrieval of movement instructions. | Phase 1. Repository describes a public-domain JSON dataset. Audit provenance/media, incomplete equipment fields and exercise suitability before importing. Add our own reviewed movement patterns and substitution groups. |
| [wger-project/wger](https://github.com/wger-project/wger) | Alternative exercise content/API and programming reference. | Optional alternative, not a second mandatory catalogue. AGPL application code and separately licensed Creative Commons content; review specific entries and obligations before reuse. |
| [lightgbm-org/LightGBM](https://github.com/lightgbm-org/LightGBM) | Train tabular response prediction models from health features plus candidate workout features. | Phase 4. Start with this against a simple statistical baseline. It supplies algorithms, not health expertise or labels. |
| [mlflow/mlflow](https://github.com/mlflow/mlflow) | Track training datasets/versions, parameters, evaluation and model releases. | Phase 4. Store aggregate metrics and restricted artefacts; avoid uploading raw personal records in experiment traces. |
| [Nokia-Bell-Labs/papagei-foundation-model](https://github.com/Nokia-Bell-Labs/papagei-foundation-model) | Research candidate for raw optical pulse signal representations. | Defer. Its input is raw PPG waveforms; Strive's daily sleep/HRV/provider scores are not compatible substitutes. Not a workout planning model. |

Use official [WHOOP](https://developer.whoop.com/api/) and [Oura](https://cloud.ouraring.com/v2/docs) APIs for current cloud connectors rather than unofficial scraping wrappers. Verify access, approved uses and supported fields before committing a delivery date.

## What to train and where the examples come from

**First learned task:** predict session completion and reported effort for a candidate workout, given the user's recent context. Feed candidate duration, exercises, volume and effort targets alongside personal features. Use these predictions to rank already-valid candidates. Keep programme goals and minimum useful training stimulus explicit: maximising completion alone would favour workouts that are too easy.

**Main dataset:** permissioned Strive histories linking input-at-decision-time → proposed options → accepted/edited session → actual execution → subsequent feedback. Store the policy version, selected candidate, override and outcome availability. Separate operational personalisation from permission to include a person's records in cross-user model training.

**Expert examples:** have a qualified coach label realistic cases and review candidate plans. Record acceptable alternatives and reasons, not just a single supposedly correct workout. Use synthetic cases for boundary testing; they do not demonstrate real-world effectiveness.

**Public data:** [UCI PAMAP2](https://archive.ics.uci.edu/dataset/231/pamap2+physical+activity+monitoring) contains labelled physical activities and sensor data. It can support an optional activity-recognition experiment, but its small controlled cohort and lack of personalised programme outcomes make it unsuitable as the main workout-recommendation training set. Exercise catalogues are retrieval data, not recovery-response labels. Avoid importing generic hospital/EHR data simply because it is labelled “health”.

**LLM training:** use a general language model only after the structured decision is available, to explain it or parse user preferences. Retrieve approved exercise/programming material with source/version metadata. Fine-tune wording later only if evaluated examples show a consistent gap; fine-tuning on exercise descriptions will not establish personalised physiological reasoning. Choose provider, retention settings and budget before implementation.

## Evaluation and release criteria

- Begin with a deterministic baseline and no-wearable fallback. Require all hard-constraint fixtures to pass, including stale/conflicting records, pain flags, no equipment, short time windows and new users.
- Split training/evaluation by user and forward time; compute baselines only from past records. Evaluate both unseen users and future sessions for known users. Report results separately by device, experience and data completeness.
- Measure effort-prediction error, completion calibration, trainer-rated appropriateness, constraint violations, override reasons and longer-term progress. Confidence means measured predictive reliability; heuristic data coverage must be labelled separately.
- Use user-level uncertainty estimates and learning curves to decide whether more data is needed. There is no justified fixed number of users or sessions that guarantees a good model.
- Historical data are confounded: we observe only the workout actually chosen, not every alternative. Offline accuracy cannot prove a better policy or injury prevention. Run shadow predictions first, followed by a bounded, consented prospective comparison of professionally approved options.
- Keep rollback to the deterministic planner; version features, rules, model and catalogue. No autonomous online model updates in the initial release. Professional review and a defined incident process precede wider adaptive coaching.
- Health records remain account-scoped. Minimise external model payloads; enforce retention/deletion, encryption and access controls. Carry training permissions and source-use restrictions into dataset creation, including provider/platform restrictions; user opt-in alone does not establish every reuse right.

## Delivery sequence

Indicative engineering estimates for one experienced full-time developer, excluding provider approvals, professional review and elapsed data collection:

1. **Data contract and outcome logging — 1–2 weeks:** structured training profile, richer check-ins, observation provenance, decision/outcome tables, replayable fixtures. Deliver a reliable input snapshot without a trained model.
2. **First adaptive planner — 2–3 weeks:** reviewed catalogue and programme templates, weekly plan, bounded daily adjustments, reasons, acceptance/override and session snapshot integration. Deliver useful manual-data coaching.
3. **Wearable integration and beta — 2–4 weeks:** complete existing cloud ingestion, then native health adapters; validate duplicates, stale data and real-device permissions. Collect longitudinal feedback. Provider and device work can change this estimate.
4. **Learned predictor — 2–3 engineering weeks once data justify it:** train baseline and LightGBM, register evaluations, run shadow mode, then a limited prospective evaluation. Data collection may take months and is not included in the estimate.
5. **Conversational coach — 1–2 weeks:** optional language interface grounded in validated plans with structured output checks and fallback explanations.

Recommended first implementation slice: profile + feature snapshot + four-week template planner + today's proposal + accept/override/outcome logging. This creates immediate product value and the evidence needed to train Strive's own model later.
