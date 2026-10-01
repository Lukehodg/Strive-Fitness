import { useState, type FormEvent } from "react";
import { Redirect } from "wouter";
import { ArrowRight, Activity, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function AuthPage() {
  const { user, signIn, signUp, error } = useAuth();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  if (user) return <Redirect to="/" />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (register) await signUp(name, email, password);
      else await signIn(email, password);
    } catch {
      /* The auth context displays the error. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="strive-wordmark" href="/">
          STRIVE<span>FITNESS</span>
        </a>
        <div>
          <p className="eyebrow">MAKE EVERY DAY COUNT</p>
          <h1>
            Your health.
            <br />
            One clear picture.
          </h1>
          <p>
            Bring your training, nutrition and daily routine together. Build
            consistency, one day at a time.
          </p>
          <div className="story-detail">
            <Activity size={20} />
            <span>Built around your everyday progress</span>
          </div>
        </div>
        <p className="muted">
          WHOOP & Oura connections are the next milestone.
        </p>
      </section>
      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <p className="eyebrow">YOUR PERSONAL SPACE</p>
          <h2>{register ? "Start your next chapter." : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "Create your private Strive account."
              : "Sign in to pick up where you left off."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {register && (
              <p className="muted text-sm">Use at least 8 characters.</p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error.message}
              </p>
            )}
            <button className="primary-action" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-action"
            type="button"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Already have an account? Sign in"
              : "New to Strive? Create an account"}
          </button>
          <div className="auth-footnote">
            <ShieldCheck size={16} />
            <span>Your records belong to your account.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
