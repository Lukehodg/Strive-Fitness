// The trainable ML signal model.
//
// This is the "AI model that generates buy/sell signals itself." It learns from
// historical candles which combinations of market features tend to precede a
// price rise, then predicts the probability that price will rise over the next
// few bars. That probability drives entries and exits.
//
// Two design choices keep it honest and safe:
//   - It reports OUT-OF-SAMPLE validation accuracy (trained on older data,
//     measured on newer data it never saw). That's the number to trust.
//   - It will not trade at all unless validation accuracy clears a floor above
//     50%. A model that's only guessing produces no signals — it stays flat
//     rather than trading on noise.

import type { Candle, FeatureImportance, MLStatus } from "@shared/schema";
import {
  buildDataset,
  extractFeatures,
  FEATURE_NAMES,
  MIN_LOOKBACK,
} from "./features";
import {
  accuracy,
  fitStandardizer,
  predictProba,
  standardize,
  trainLogistic,
  type LogisticModel,
  type StandardizeStats,
} from "./logistic";

/** Validation accuracy the model must beat before it's allowed to trade. */
const TRADABLE_FLOOR = 0.52;
/** Fraction of the dataset used for training; the rest validates. */
const TRAIN_SPLIT = 0.7;
/** Minimum labelled samples before a fit is even attempted. */
const MIN_SAMPLES = 80;

interface ModelState {
  model: LogisticModel;
  stats: StandardizeStats;
  trainedAt: number;
  samples: number;
  trainAccuracy: number;
  validationAccuracy: number;
}

class SignalModel {
  private state: ModelState | null = null;
  private lastProbability: number | null = null;

  /**
   * Train (or retrain) on the given candle history using a chronological
   * train/validation split. Returns the validation accuracy, or null if there
   * wasn't enough data to fit.
   */
  train(candles: Candle[]): number | null {
    const { X, y } = buildDataset(candles);
    if (X.length < MIN_SAMPLES) return null;

    const split = Math.floor(X.length * TRAIN_SPLIT);
    const Xtrain = X.slice(0, split);
    const yTrain = y.slice(0, split);
    const Xval = X.slice(split);
    const yVal = y.slice(split);

    // Standardize using TRAINING stats only (no leakage from validation).
    const stats = fitStandardizer(Xtrain);
    const XtrainS = Xtrain.map((r) => standardize(r, stats));
    const XvalS = Xval.map((r) => standardize(r, stats));

    const model = trainLogistic(XtrainS, yTrain, {
      iterations: 500,
      learningRate: 0.1,
      l2: 1e-3,
    });

    this.state = {
      model,
      stats,
      trainedAt: Date.now(),
      samples: X.length,
      trainAccuracy: accuracy(model, XtrainS, yTrain),
      validationAccuracy: accuracy(model, XvalS, yVal),
    };
    return this.state.validationAccuracy;
  }

  /**
   * Predict P(price rises over the horizon) for the newest bar. Returns null
   * when the model isn't trained or there isn't enough history yet.
   */
  predictProba(candles: Candle[]): number | null {
    if (!this.state) return null;
    if (candles.length <= MIN_LOOKBACK) return null;
    const feats = extractFeatures(candles, candles.length - 1);
    if (!feats) return null;
    const p = predictProba(this.state.model, standardize(feats, this.state.stats));
    this.lastProbability = p;
    return p;
  }

  /** Whether the model's out-of-sample accuracy clears the tradable floor. */
  isTradable(): boolean {
    return !!this.state && this.state.validationAccuracy >= TRADABLE_FLOOR;
  }

  private featureImportances(): FeatureImportance[] {
    if (!this.state) return [];
    return FEATURE_NAMES.map((name, j) => ({
      name,
      weight: this.state!.model.weights[j] ?? 0,
    })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
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
      featureImportances: this.featureImportances(),
      lastProbability: this.lastProbability,
    };
  }
}

export const signalModel = new SignalModel();
