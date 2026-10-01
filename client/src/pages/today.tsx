import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Dumbbell, Plus, Check, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { DailyStats, WorkoutTemplate } from "@shared/schema";
type CheckIn = {
  energy: "low" | "usual" | "high";
  soreness: "none" | "some" | "high";
  limited: boolean;
};
export default function Today() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: user?.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const stats = useQuery<DailyStats>({
    queryKey: ["/api/users/me/daily-stats", day],
    queryFn: () =>
      fetch(`/api/users/me/daily-stats?date=${day}`).then(async (r) => {
        if (!r.ok) throw new Error("Could not load nutrition.");
        return r.json();
      }),
  });
  const workouts = useQuery<WorkoutTemplate[]>({
    queryKey: ["/api/users/me/workout-templates"],
  });
  const checkIn = useQuery<CheckIn | null>({
    queryKey: ["/api/check-in", day],
  });
  const [form, setForm] = useState<CheckIn>({
    energy: "usual",
    soreness: "none",
    limited: false,
  });
  useEffect(() => {
    if (checkIn.data) setForm(checkIn.data);
  }, [checkIn.data]);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/check-in", {
        energy: form.energy,
        soreness: form.soreness,
        limited: form.limited,
      });
      return res.json();
    },
    onSuccess: (data) => cache.setQueryData(["/api/check-in", day], data),
  });
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: user?.timezone || "UTC",
    weekday: "long",
  }).format(new Date());
  const planned = workouts.data?.find((w) => w.scheduledDay === weekday);
  const calories = stats.data?.caloriesConsumed || 0;
  return (
    <div className="page-stack">
      <header className="page-heading today-heading">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: user?.timezone || "UTC",
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </p>
          <h1>Your day, {user?.displayName.split(" ")[0]}.</h1>
          <p>A little more intention. A stronger everyday.</p>
        </div>
        <Link href="/nutrition" className="secondary-action">
          <Plus size={17} /> Log a meal
        </Link>
      </header>
      <div className="today-grid">
        <div className="page-stack">
          <section className="training-hero">
            <span className="eyebrow">TODAY'S TRAINING</span>
            <div className="hero-symbol">
              <Dumbbell size={30} />
            </div>
            <h2>
              {workouts.isPending
                ? "Loading your plan…"
                : planned
                  ? planned.name
                  : "Make room for progress."}
            </h2>
            <p>
              {planned
                ? `${planned.duration} minutes · ${planned.exerciseCount} exercises in your saved plan`
                : "Build a workout around your goals, equipment and the time you have."}
            </p>
            <Link
              className="primary-action"
              href={planned ? "/workouts" : "/workouts/create"}
            >
              {planned ? "Review your workout" : "Create a workout"}
              <ArrowRight size={17} />
            </Link>
            <div className="hero-foot">
              <Activity size={16} />
              <span>Recovery guidance awaits real wearable data.</span>
            </div>
          </section>
          <section className="surface">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PAUSE & CHECK IN</p>
                <h2>How are you feeling?</h2>
              </div>
              {checkIn.data && (
                <span className="saved-label">
                  <Check size={14} /> Saved today
                </span>
              )}
            </div>
            <form
              className="checkin-form"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="field-pair">
                <label>
                  Energy
                  <select
                    value={form.energy}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        energy: e.target.value as CheckIn["energy"],
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="usual">Usual</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Soreness
                  <select
                    value={form.soreness}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        soreness: e.target.value as CheckIn["soreness"],
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="some">Some</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.limited}
                  onChange={(e) =>
                    setForm({ ...form, limited: e.target.checked })
                  }
                />{" "}
                Illness, pain or injury is limiting me today
              </label>
              <p className="muted text-sm">
                Saved to your daily history. Your workout is not automatically
                changed.
              </p>
              {(save.error || checkIn.error) && (
                <p role="alert" className="form-error">
                  {(save.error || checkIn.error)?.message}
                </p>
              )}
              <button className="secondary-action" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save check-in"}
              </button>
            </form>
          </section>
        </div>
        <div className="page-stack">
          <section className="surface">
            <div className="section-heading">
              <h2>Nutrition today</h2>
              <Link href="/nutrition" className="inline-link">
                Open <ArrowRight size={15} />
              </Link>
            </div>
            {stats.isError ? (
              <p role="alert">
                Could not load your totals.{" "}
                <button onClick={() => stats.refetch()}>Retry</button>
              </p>
            ) : (
              <>
                <p className="big-value">
                  {stats.isPending ? "—" : calories.toLocaleString()}{" "}
                  <span>kcal logged</span>
                </p>
                <p className="muted text-sm">
                  {user?.dailyCalorieTarget
                    ? `${Math.max(0, user.dailyCalorieTarget - calories).toLocaleString()} kcal remaining of your ${user.dailyCalorieTarget.toLocaleString()} target`
                    : "Set your own targets in Food when you are ready."}
                </p>
                <div className="macro-list">
                  {[
                    {
                      label: "Protein",
                      value: stats.data?.proteinConsumed,
                      target: user?.dailyProteinTarget,
                    },
                    {
                      label: "Carbs",
                      value: stats.data?.carbsConsumed,
                      target: user?.dailyCarbsTarget,
                    },
                    {
                      label: "Fat",
                      value: stats.data?.fatConsumed,
                      target: user?.dailyFatTarget,
                    },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="macro-label">
                        <span>{m.label}</span>
                        <strong>
                          {Number(m.value || 0).toFixed(0)}g{" "}
                          {m.target ? (
                            <span className="muted">/ {m.target}g</span>
                          ) : null}
                        </strong>
                      </div>
                      <div className="macro-track">
                        <div
                          style={{
                            width: `${m.target ? Math.min(100, (100 * Number(m.value || 0)) / m.target) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="surface">
            <p className="eyebrow">BUILD YOUR DAILY PICTURE</p>
            <h2>Connect what matters.</h2>
            <p className="muted">
              WHOOP and Oura will bring recovery and sleep alongside your
              training.
            </p>
            <div className="device-row">
              <span>WHOOP</span>
              <span>Oura</span>
            </div>
            <Link className="inline-link" href="/connections">
              View connection status <ArrowRight size={16} />
            </Link>
          </section>
          <section className="surface">
            <p className="eyebrow">YOUR ROUTINE</p>
            <h2>Small habits. Consistent days.</h2>
            <p className="muted">
              Track your supplements and existing medication schedule in one
              place.
            </p>
            <Link href="/medications" className="inline-link">
              Manage your routine <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      </div>
      {workouts.isError && (
        <p role="alert" className="form-error">
          Could not load your workout plan.{" "}
          <button onClick={() => workouts.refetch()}>Retry</button>
        </p>
      )}
    </div>
  );
}
