import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

const targets = [
  ["dailyCalorieTarget", "Calories (kcal)", 20000],
  ["dailyProteinTarget", "Protein (g)", 1000],
  ["dailyCarbsTarget", "Carbs (g)", 2000],
  ["dailyFatTarget", "Fat (g)", 1000],
] as const;

export default function AccountSettings() {
  const { user, refreshUser, signOut } = useAuth();
  const [name, setName] = useState(user?.displayName || "");
  const [timezone, setTimezone] = useState(user?.timezone || "UTC");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      targets.map(([key]) => [key, user?.[key]?.toString() || ""]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await apiRequest("PATCH", "/api/user/me", {
        displayName: name,
        timezone,
        ...Object.fromEntries(
          targets.map(([key]) => [
            key,
            values[key] === "" ? null : Number(values[key]),
          ]),
        ),
      });
      await refreshUser();
      await queryClient.invalidateQueries();
      setMessage("Your settings are saved.");
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : "Could not save settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>Make it yours.</h1>
        <p>Your profile, timezone and personal targets.</p>
      </header>
      <form className="auth-form" onSubmit={save}>
        <label>
          Your name
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Email address
          <input type="email" readOnly value={user?.username || ""} />
        </label>
        <label>
          Timezone
          <input
            required
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Europe/London"
          />
        </label>
        <p className="muted">
          Your timezone determines which day meals and check-ins belong to.
        </p>
        <h2>Nutrition targets</h2>
        <p className="muted">Enter your own targets, or leave them blank.</p>
        {targets.map(([key, label, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={key === "dailyCalorieTarget" ? 1 : 0}
              max={max}
              step={1}
              value={values[key]}
              onChange={(event) =>
                setValues({ ...values, [key]: event.target.value })
              }
            />
          </label>
        ))}
        {message && (
          <p
            role={failed ? "alert" : "status"}
            className={failed ? "form-error" : "muted"}
          >
            {message}
          </p>
        )}
        <button className="primary-action" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </form>
      <button
        className="secondary-action"
        onClick={() => {
          void signOut().catch(() => {
            setFailed(true);
            setMessage("Could not sign out. Please retry.");
          });
        }}
      >
        Sign out
      </button>
    </section>
  );
}
