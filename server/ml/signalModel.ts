// The trainable ML signal model.
//
// This is the "AI model that generates buy/sell signals itself." It learns from
// historical candles which combinations of market features precede a profitable
// up-move (triple-barrier labelled), then predicts the probability of such a
// move. That probability drives entries and exits.
//
// Honesty & safety are built in:
//   - Validation accuracy is estimated by PURGED WALK-FORWARD cross-validation
//     (leak-free), not an optimistic in-sample number.
//   - The model refuses to trade unless that accuracy clears a floor above 50%.
//   - A model trained on real downloaded history can be SAVED to disk and
//     reloaded, so the mature model survives restarts and isn't clobbered by
//     light retraining on the small live window.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  Candle,
  FeatureImportance,
  MetaModelStatus,
  MLDataInfo,
  MLStatus,
} from "@shared/schema";
import { buildDataset, extractFeatures, FEATURE_NAMES, MIN_LOOKBACK, LABEL_HORIZON } from "./features";
import {
  accuracy,
  fitStandardizer,
  predictProba,
  standardize,
  trainLogistic,
  type LogisticModel,
  type StandardizeStats,
} from "./logistic";
import { purgedWalkForwardAccuracy } from "./cv";

const TRADABLE_FLOOR = 0.52;
const MIN_SAMPLES = 80;
const MODEL_PATH = join(process.cwd(), "data", "ml-model.json");
const VALIDATION_METHOD = "purged walk-forward CV";
const LABELING = "triple-barrier";

interface ModelState {
  model: LogisticModel;
  stats: StandardizeStats;
  trainedAt: number;
  samples: number;
  trainAccuracy: number;
  validationAccuracy: number;
  /** Accuracy of always predicting the majority class — the bar to beat. */
  baselineRate: number;
  dataInfo: MLDataInfo | null;
  fromDisk: boolean;
  /** Meta-labeling model over [primaryProb, ...features], or null. */
  metaModel: LogisticModel | null;
  metaStats: StandardizeStats | null;
  meta: MetaModelStatus | null;
}

/** How much validation accuracy must beat the majority-class baseline by. */
const EDGE_MARGIN = 0.01;
/** Primary probability at/above which a bar counts as a "signal" for meta. */
const META_SIGNAL_THRESHOLD = 0.55;
/** Meta confidence required to approve (and size) a bet. */
export const META_APPROVAL = 0.5;
/** Minimum signal-samples before a meta model is fitted at all. */
const MIN_META_SAMPLES = 40;

/** Metadata about the data a training run used. */
export interface TrainMeta {
  source: MLDataInfo["source"];
  symbol: string;
  interval: string;
}

class SignalModel {
  private state: ModelState | null = null;
  private lastProbability: number | null = null;

  /**
   * Train (or retrain) on the given candle history. Uses triple-barrier labels,
   * a richer feature set, and purged walk-forward CV for the honest accuracy.
   * Returns the validation accuracy, or null if there wasn't enough data.
   */
  train(candles: Candle[], meta: TrainMeta): number | null {
    const { X, y } = buildDataset(candles);
    if (X.length < MIN_SAMPLES) return null;

    // Honest, leak-free out-of-sample estimate (+ out-of-fold predictions).
    const cv = purgedWalkForwardAccuracy(X, y, {
      folds: 4,
      purge: LABEL_HORIZON,
    });

    // Final model: fit on all data (standardized) for live prediction.
    const stats = fitStandardizer(X);
    const XS = X.map((r) => standardize(r, stats));
    const model = trainLogistic(XS, y, { iterations: 600, learningRate: 0.1, l2: 1e-3 });

    const posRate = y.reduce((a, b) => a + b, 0) / y.length;
    const baselineRate = Math.max(posRate, 1 - posRate);

    // Meta-labeling: on bars where the (out-of-fold) primary signalled a buy,
    // learn whether the signal was CORRECT. At runtime the meta model gates
    // low-confidence signals and sizes the bets that pass.
    const metaFit = this.fitMeta(X, cv.oof);

    this.state = {
      model,
      stats,
      trainedAt: Date.now(),
      samples: X.length,
      trainAccuracy: accuracy(model, XS, y),
      validationAccuracy: cv.accuracy,
      baselineRate,
      metaModel: metaFit?.model ?? null,
      metaStats: metaFit?.stats ?? null,
      meta: metaFit?.status ?? null,
      dataInfo: {
        source: meta.source,
        symbol: meta.symbol,
        interval: meta.interval,
        bars: candles.length,
        from: candles[0]?.time ?? null,
        to: candles[candles.length - 1]?.time ?? null,
      },
      fromDisk: false,
    };
    return cv.accuracy;
  }

  /**
   * Fit the meta-labeling model on out-of-fold primary predictions. Returns
   * null when there aren't enough signal-samples.
   */
  private fitMeta(
    X: number[][],
    oof: { index: number; prob: number; label: number }[],
  ): {
    model: LogisticModel;
    stats: StandardizeStats;
    status: MetaModelStatus;
  } | null {
    // Signals only: bars where the primary (out-of-fold) said "buy".
    const signals = oof.filter((o) => o.prob >= META_SIGNAL_THRESHOLD);
    if (signals.length < MIN_META_SAMPLES) return null;

    const metaX = signals.map((o) => [o.prob, ...X[o.index]]);
    const metaY = signals.map((o) => o.label); // was the signal correct?

    // Chronological split (oof is fold-ordered = chronological).
    const split = Math.floor(metaX.length * 0.7);
    const Xtr = metaX.slice(0, split);
    const ytr = metaY.slice(0, split);
    const Xva = metaX.slice(split);
    const yva = metaY.slice(split);
    if (Xva.length < 10) return null;

    const stats = fitStandardizer(Xtr);
    const XtrS = Xtr.map((r) => standardize(r, stats));
    const XvaS = Xva.map((r) => standardize(r, stats));
    const model = trainLogistic(XtrS, ytr, { iterations: 400, learningRate: 0.1, l2: 1e-2 });

    const valAcc = accuracy(model, XvaS, yva);
    const approvals = XvaS.filter((r) => predictProba(model, r) >= META_APPROVAL).length;

    return {
      model,
      stats,
      status: {
        samples: signals.length,
        validationAccuracy: valAcc,
        coverage: Xva.length ? approvals / Xva.length : 0,
      },
    };
  }

  /** Predict P(a profitable up-move) for the newest bar, or null if not ready. */
  predictProba(candles: Candle[]): number | null {
    if (!this.state) return null;
    if (candles.length <= MIN_LOOKBACK) return null;
    const feats = extractFeatures(candles, candles.length - 1);
    if (!feats) return null;
    const p = predictProba(this.state.model, standardize(feats, this.state.stats));
    this.lastProbability = p;
    return p;
  }

  isTradable(): boolean {
    if (!this.state) return false;
    // Must clear the floor AND genuinely beat the majority-class baseline —
    // so a model that just predicts "up" in a trending market isn't "tradable".
    return (
      this.state.validationAccuracy >= TRADABLE_FLOOR &&
      this.state.validationAccuracy >= this.state.baselineRate + EDGE_MARGIN
    );
  }

  /**
   * Predict for the newest bar with meta-labeling applied. `metaConfidence`
   * is P(this signal is correct) — used as bet size; `approved` is false when
   * the meta model vetoes the signal. Without a meta model, signals pass
   * through unchanged (approved, confidence null).
   */
  predictWithMeta(candles: Candle[]): {
    prob: number;
    metaConfidence: number | null;
    approved: boolean;
  } | null {
    const prob = this.predictProba(candles);
    if (prob === null || !this.state) return null;
    const { metaModel, metaStats } = this.state;
    if (!metaModel || !metaStats) {
      return { prob, metaConfidence: null, approved: true };
    }
    const feats = extractFeatures(candles, candles.length - 1);
    if (!feats) return { prob, metaConfidence: null, approved: true };
    const conf = predictProba(metaModel, standardize([prob, ...feats], metaStats));
    return { prob, metaConfidence: conf, approved: conf >= META_APPROVAL };
  }

  /** True when the loaded model came from a saved file (a mature model). */
  get fromDisk(): boolean {
    return this.state?.fromDisk ?? false;
  }

  private featureImportances(): FeatureImportance[] {
    if (!this.state) return [];
    return FEATURE_NAMES.map((name, j) => ({
      name,
      weight: this.state!.model.weights[j] ?? 0,
    })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  }

  // -- Persistence --------------------------------------------------------

  saveToDisk(): void {
    if (!this.state) return;
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    const payload = { ...this.state, featureNames: FEATURE_NAMES };
    writeFileSync(MODEL_PATH, JSON.stringify(payload));
    this.appendRegistry();
  }

  /** Append this model's stats to the on-disk model registry (audit trail). */
  private appendRegistry(): void {
    if (!this.state) return;
    const registryPath = join(process.cwd(), "data", "model-registry.json");
    let entries: unknown[] = [];
    try {
      if (existsSync(registryPath)) {
        entries = JSON.parse(readFileSync(registryPath, "utf-8"));
      }
    } catch {
      entries = [];
    }
    entries.push({
      trainedAt: this.state.trainedAt,
      samples: this.state.samples,
      trainAccuracy: this.state.trainAccuracy,
      validationAccuracy: this.state.validationAccuracy,
      baselineRate: this.state.baselineRate,
      tradable: this.isTradable(),
      dataInfo: this.state.dataInfo,
    });
    writeFileSync(registryPath, JSON.stringify(entries.slice(-100), null, 2));
  }

  /** Load a previously-saved model. Returns true if one was loaded. */
  loadFromDisk(): boolean {
    try {
      if (!existsSync(MODEL_PATH)) return false;
      const raw = JSON.parse(readFileSync(MODEL_PATH, "utf-8"));
      // Only accept a model whose feature layout matches the current code.
      if (
        !raw?.model?.weights ||
        raw.model.weights.length !== FEATURE_NAMES.length
      ) {
        return false;
      }
      // Meta model is only kept if its feature layout matches ([prob, ...features]).
      const metaOk =
        raw.metaModel?.weights?.length === FEATURE_NAMES.length + 1 && raw.metaStats;
      this.state = {
        model: raw.model,
        stats: raw.stats,
        trainedAt: raw.trainedAt,
        samples: raw.samples,
        trainAccuracy: raw.trainAccuracy,
        validationAccuracy: raw.validationAccuracy,
        baselineRate: raw.baselineRate ?? 0.5,
        dataInfo: raw.dataInfo ?? null,
        fromDisk: true,
        metaModel: metaOk ? raw.metaModel : null,
        metaStats: metaOk ? raw.metaStats : null,
        meta: metaOk ? (raw.meta ?? null) : null,
      };
      return true;
    } catch {
      return false;
    }
  }

  status(): MLStatus {
    const s = this.state;
    return {
      trained: !!s,
      trainedAt: s?.trainedAt ?? null,
      samples: s?.samples ?? 0,
      trainAccuracy: s?.trainAccuracy ?? 0,
      validationAccuracy: s?.validationAccuracy ?? 0,
      tradable: this.isTradable(),
      tradableFloor: TRADABLE_FLOOR,
      baselineRate: s?.baselineRate ?? 0.5,
      featureImportances: this.featureImportances(),
      lastProbability: this.lastProbability,
      validationMethod: VALIDATION_METHOD,
      labeling: LABELING,
      dataInfo: s?.dataInfo ?? null,
      fromDisk: s?.fromDisk ?? false,
      meta: s?.meta ?? null,
    };
  }
}

export const signalModel = new SignalModel();
