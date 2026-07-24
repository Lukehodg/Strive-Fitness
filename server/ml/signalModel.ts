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
}

/** How much validation accuracy must beat the majority-class baseline by. */
const EDGE_MARGIN = 0.01;

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

    // Honest, leak-free out-of-sample estimate.
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

    this.state = {
      model,
      stats,
      trainedAt: Date.now(),
      samples: X.length,
      trainAccuracy: accuracy(model, XS, y),
      validationAccuracy: cv.accuracy,
      baselineRate,
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
    };
  }
}

export const signalModel = new SignalModel();
