import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, Field, Heading, Muted, Screen } from "@/components/ui";
import { spacing } from "@/components/theme";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/auth";

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("+44");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    try {
      setBusy(true);
      await sendPhoneOtp(phone.trim());
      setSent(true);
    } catch (e) {
      Alert.alert("Couldn't send code", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    try {
      setBusy(true);
      await verifyPhoneOtp(phone.trim(), code.trim());
      // Root navigator routes onward once the session/profile updates.
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Verification failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={{ gap: spacing(2) }}>
          <Heading>Verify your phone</Heading>
          <Muted>
            We verify every member by phone. Your number is never shown to other players.
          </Muted>
        </View>

        <View style={{ gap: spacing(4) }}>
          <Field
            label="Mobile number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+447700900123"
            editable={!sent}
          />

          {sent ? (
            <Field
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="123456"
              maxLength={6}
            />
          ) : null}

          {sent ? (
            <Button title="Verify & continue" onPress={verify} loading={busy} />
          ) : (
            <Button title="Send code" onPress={send} loading={busy} />
          )}

          {sent ? (
            <Button title="Use a different number" variant="secondary" onPress={() => setSent(false)} />
          ) : null}
        </View>

        <View />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing(6), justifyContent: "space-between", paddingTop: spacing(12) },
});
