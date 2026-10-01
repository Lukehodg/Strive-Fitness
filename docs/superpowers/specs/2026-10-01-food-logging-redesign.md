# Food logging redesign

Status: researched design and interactive concept; not implemented in the native app.

## Outcome

Make everyday logging understandable without nutrition-label entry on every visit. Preserve Strive's dark green and mint appearance and the existing iOS/Android app, barcode lookup and portion arithmetic. The user has approved the health-overview and workout-coach direction separately; those remain separate workstreams.

## Research, 1 October 2026

Reviewed official mobile help flows, not hands-on competitor app testing:

- [MyFitnessPal: log food](https://support.myfitnesspal.com/hc/en-us/articles/360032274592-How-to-log-food-to-your-diary). Logging begins from a meal or a general add action. Search and scanning lead to a result, with serving and meal adjustments. Saved meals and recipes reduce repeated entry.
- [MyFitnessPal: recent/frequent lists](https://support.myfitnesspal.com/hc/en-us/articles/360032622071-How-the-Recent-and-Frequent-lists-work). Repeated foods deserve prominent shortcuts. Search indexed this official page; direct retrieval failed, so detailed limits and ranking behaviour are not assumed.
- [Cronometer: add food](https://support.cronometer.com/hc/en-us/articles/360018955211-Mobile-Add-a-Food). Search, favourites, food detail and portion selection are distinct steps. Multi-add includes reviewing selected items before committing to the diary.
- [Cronometer: scan food](https://support.cronometer.com/hc/en-us/articles/360020441392-Mobile-Scan-Food). A barcode match leads to portion entry. Manual barcode entry and custom-food creation provide fallbacks.

Design inference: use a meal-first diary, food selection before nutrient editing, and repeat-food shortcuts. Do not copy competitor branding or claim access to their databases.

## Current Strive friction

- `mobile/src/app/(tabs)/food.tsx` combines diary, manual nutrition entry, targets and typed history dates in one large component.
- Scanning appears above the page heading and becomes unavailable while a food form is populated.
- Add food opens four nutrient inputs rather than food discovery. Nutrition basis and quantity are competing concepts.
- Meals have no contextual Add button. Each diary entry has large Edit and Log again actions.
- History asks for a YYYY-MM-DD string. New entries always use the current instant even while viewing another date.
- The native scanner uses Open Food Facts. Existing server text search requires Nutritionix credentials; it is not wired into the native screen. A search UI alone cannot complete this feature.
- The journal has idempotent single-entry creation and portion updates, but no dedicated batch/recent/favourites/saved-meal endpoints.

## Recommended flow

1. Food opens a daily diary. Compact calories and macro totals above Breakfast, Lunch, Dinner and Snacks. Each meal has Add food. Date navigation replaces the History tab; target editing moves to a secondary control.
2. Add food opens a focused screen with a clearly visible meal and date. Search at the top, Scan barcode next to it, Recent/Favourites/Meals below. Search empty state shows useful repeat foods, not a blank nutrient form.
3. Selecting a result opens Your portion: food/brand/source, amount and supported unit, calculated calories/macros, and a primary action. Nutrition per 100 g/ml lives in expandable details. Never assume grams equal millilitres. Offer a household serving only when its conversion is known.
4. The plus shortcut adds the explicitly displayed previous portion to a draft. A visible review action shows draft count and calories. Changing portion recalculates immediately. Draft editing/removal does not affect saved diary data.
5. Review the meal, then log it once. Return to the same day's diary, update totals and offer Undo. Draft survives a failed save. A retry uses the same idempotency key and payload.
6. Tap a diary row to edit, move meal, copy, or remove. Whole-meal reuse creates a new snapshot so later edits cannot rewrite history.

## Alternatives considered

- Scan-first: fast for packaged products, poor for home-cooked food and repeat meals.
- Search-first full page: good discovery, but weak day/meal context and more navigation.
- Meal-first diary with shared add flow: recommended; handles packaged, repeated and mixed meals with one consistent destination.

## Real data and privacy

First implement authenticated recent-food search, favourites and reusable saved meals. Add a provider adapter for branded and generic text search; evaluate UK coverage, licensing, rate limits and commercial terms before selecting a new provider or paying for access. Existing Nutritionix integration is a credential-dependent candidate, not a verified ready service. Keep Open Food Facts barcode support. Display source and portion basis, and provide correction for incomplete/mismatched products. Missing nutrients must remain unknown and trigger review, never silently become zero.

Custom food is a secondary path for missing products. Ask for a name, label basis and available nutrients once, then save it to the user's library. Calories-only quick entry requires an explicit unknown-macro model and incomplete-total indicator; do not include it by treating absent macros as zero. Photo/voice estimates are deferred.

All diary, library and draft persistence is scoped to the signed-in user. No food logs are sent to the workout AI by default. Barcode images remain local under the existing scanner behaviour.

## Implementation boundaries

- Split diary, discovery, portion editor and review into focused native components/routes.
- Add typed food-catalogue records retaining provider identity, brand, nutrient basis and supported serving conversions. Existing entries remain readable with a legacy fallback.
- Add per-user favourites and saved-meal snapshots with migrations. Recent items derive from actual journal history, deduplicated by food identity and basis rather than name alone.
- Add transactional batch creation with payload-bound idempotency. Add account-scoped delete/restore support for Undo, and account-timezone date handling. Validate backdated entries against the selected diary day, including DST transitions.
- Avoid auto-adjusting food targets from wearable expenditure. Keep targets user-controlled.
- Keep a pending draft when offline, clearly mark it unsaved, and do not display success until the server acknowledges the commit.

## Acceptance checks

- From a meal, a recent item can be selected and logged with its shown portion without retyping nutrients.
- Scan match goes to the same portion editor; not-found/denied-camera states offer search, manual barcode or custom food.
- 150 g from per-100 g data uses a 1.5 multiplier; ml and servings preserve their correct bases. Invalid/blank quantities cannot be saved.
- Editing a historical entry preserves its selected date. New entries on a historical day are placed on that day in the account timezone.
- Batch retry cannot duplicate items; an incomplete save never loses the draft or falsely updates totals.
- Saved meal reuse preserves component quantities and allows review. Editing a new copy leaves earlier logs intact.
- Delete/Undo restores entries and totals. Cross-user read/write/delete attempts are rejected.
- Dynamic text, keyboard, screen reader labels and touch targets work on iPhone and Android. Verify narrow screens and large text physically before release.
- Native lint/typecheck, meaningful journal/portion tests, bundle export and an installable preview build pass before claiming completion.

## Concept scope

The interactive concept uses labelled sample foods and local-only state. It demonstrates diary, Recent/Favourites/Meals selection, portion recalculation, draft review, edit/delete/undo and simulated barcode lookup. It does not search a live database or modify the user's diary. Custom-food, target and arbitrary calendar editors are implementation requirements, not simulated controls in this concept.
