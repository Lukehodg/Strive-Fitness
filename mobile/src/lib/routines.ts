export type Routine = {
  id: number;
  name: string;
  category: "supplement" | "peptide" | "medication";
  type: string;
  dosage: string;
  frequency: string;
  notes: string | null;
  isActive: boolean;
};
export type RoutineLog = {
  id: number;
  medicationId: number;
  name: string;
  dosage: string;
  status: "taken" | "skipped";
  recordedAt: string;
};
