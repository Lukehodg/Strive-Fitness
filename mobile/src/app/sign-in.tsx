import { useState } from "react";
import {
  Screen,
  Heading,
  Field,
  Action,
  Feedback,
  Copy,
} from "../components/ui";
import { useSession } from "../lib/session";
export default function SignIn() {
  const { authenticate } = useSession();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await authenticate(
        email.trim(),
        password,
        register ? name.trim() : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading
        eyebrow="STRIVE FITNESS"
        title={
          register
            ? "Start your next chapter."
            : "Your health. One clear picture."
        }
        subtitle="Training, nutrition and your daily routine. Built around you."
      />
      {register && (
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={80}
        />
      )}
      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        maxLength={254}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={register ? "new-password" : "current-password"}
        maxLength={128}
      />
      <Copy>Use at least 8 characters.</Copy>
      <Feedback message={error} error />
      <Action
        label={busy ? "Please wait…" : register ? "Create account" : "Sign in"}
        disabled={
          busy ||
          !email ||
          password.length < 8 ||
          (register && name.trim().length < 2)
        }
        onPress={() => {
          void submit();
        }}
      />
      <Action
        secondary
        label={
          register ? "Already have an account? Sign in" : "Create an account"
        }
        disabled={busy}
        onPress={() => {
          setRegister(!register);
          setError("");
        }}
      />
    </Screen>
  );
}
