export type Readiness = {
  title: string;
  mode: "unknown" | "recover" | "ease" | "steady" | "progress";
  reasons: string[];
  canReduceSets: boolean;
  note: string;
  sources: {
    provider: string;
    label: string;
    score: number | null;
    sleepMinutes: number | null;
    hrv: number | null;
    usable: boolean;
    unavailableReason: string | null;
    lastSync: string | null;
  }[];
};
