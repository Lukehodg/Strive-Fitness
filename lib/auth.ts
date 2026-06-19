import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { supabase } from "@/lib/supabase";

/**
 * Auth methods. Apple + Google produce a Supabase session directly; phone OTP
 * is used both for sign-in and to set `phone_verified` on the profile, which
 * gates hosting and joining games.
 */

export async function signInWithApple(): Promise<void> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error("Apple sign-in failed: no identity token returned.");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

export const appleAvailable = Platform.OS === "ios";

/**
 * Google sign-in via a returned id_token. Wire the actual token retrieval to
 * expo-auth-session / @react-native-google-signin in the sign-in screen; this
 * helper exchanges the token for a Supabase session.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<void> {
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
}

/** Send an OTP to a phone number (E.164, e.g. +447700900123). */
export async function sendPhoneOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

/**
 * Verify the OTP. If the user already has a session (linking phone to an
 * existing Apple/Google account), pass `existingSession: true` so we update the
 * user's phone instead of creating a new sms session.
 */
export async function verifyPhoneOtp(phone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw error;
  // RLS-protected: mark the profile verified once the OTP checks out.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("profiles").update({ phone_verified: true }).eq("id", user.id);
  }
}
