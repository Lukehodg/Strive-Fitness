import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { EmptyState, Loading, Screen } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, font, fonts, isDark, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useMessages, useSendMessage, useSendPhoto } from "@/hooks/useMessages";
import { useRoster, type RosterEntry } from "@/hooks/useActivity";
import { useMarkChatRead } from "@/hooks/useUnread";
import { capture } from "@/lib/analytics";
import type { Message } from "@/types/database";

export default function GameChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activityId = id!;
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(activityId);
  const { data: roster } = useRoster(activityId);
  const [text, setText] = useState("");

  // Resolve sender name/avatar from the roster.
  const people = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    (roster ?? []).forEach((r: RosterEntry) =>
      map.set(r.user_id, { name: r.display_name, avatar: r.avatar_url }),
    );
    return map;
  }, [roster]);

  const myName = user ? people.get(user.id)?.name : undefined;
  const send = useSendMessage(activityId, myName);
  const sendPhoto = useSendPhoto(activityId, myName);

  async function onPickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    const uri = result.assets?.[0]?.uri;
    if (result.canceled || !uri) return;
    try {
      await sendPhoto.mutateAsync(uri);
    } catch (e) {
      Alert.alert("Couldn't send photo", e instanceof Error ? e.message : "Try again.");
    }
  }

  useEffect(() => {
    if (activityId) capture("chat_opened", { activityId });
  }, [activityId]);

  // Stamp "read up to now" on open and as messages arrive while on screen,
  // so the unread badges clear the moment you've actually seen the chat.
  const markRead = useMarkChatRead(activityId);
  const { mutate: stampRead } = markRead;
  const messageCount = messages?.length ?? 0;
  useEffect(() => {
    if (activityId && messageCount >= 0) stampRead();
  }, [activityId, messageCount, stampRead]);

  // Newest first for an inverted list.
  const data = useMemo(() => [...(messages ?? [])].reverse(), [messages]);

  function onSend() {
    const body = text.trim();
    if (!body) return;
    setText("");
    send.mutate(body);
  }

  if (isLoading) return <Loading />;

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        {data.length === 0 ? (
          <EmptyState icon="chatbubbles-outline" title="No messages yet" message="Say hello to the crew." />
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }: { item: Message }) => {
              const mine = item.user_id === user?.id;
              const person = people.get(item.user_id);
              return (
                <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                  {!mine ? <Avatar name={person?.name ?? "Player"} url={person?.avatar} size={28} /> : null}
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!mine ? <Text style={styles.sender}>{person?.name ?? "Player"}</Text> : null}
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.photo} />
                    ) : null}
                    {item.body ? (
                      <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                    ) : null}
                    <Text style={[styles.time, mine && styles.timeMine]}>
                      {new Date(item.created_at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <Pressable style={styles.photoBtn} onPress={onPickPhoto} disabled={sendPhoto.isPending}>
            {sendPhoto.isPending ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.textMuted} />
            )}
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message the crew…"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={isDark ? "dark" : "light"}
            multiline
            onSubmitEditing={onSend}
          />
          <Pressable
            style={[styles.send, !text.trim() && styles.sendDisabled]}
            onPress={onSend}
            disabled={!text.trim()}
          >
            <Ionicons name="arrow-up" size={20} color={colors.primaryText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4), gap: spacing(2) },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing(2), maxWidth: "85%" },
  rowMine: { alignSelf: "flex-end" },
  rowTheirs: { alignSelf: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2.5) },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.sm },
  sender: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5, color: colors.ember, marginBottom: 2 },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text },
  bodyMine: { color: colors.primaryText },
  photo: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 2,
  },
  photoBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textMuted,
    alignSelf: "flex-end",
    marginTop: 2,
  },
  timeMine: { color: "rgba(23,20,15,0.55)" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing(2),
    padding: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: font.body,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2.5),
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
});
