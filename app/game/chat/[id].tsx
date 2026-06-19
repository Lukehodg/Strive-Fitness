import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  Channel as ChannelComponent,
  Chat,
  MessageInput,
  MessageList,
  OverlayProvider,
} from "stream-chat-expo";
import type { Channel as StreamChannel } from "stream-chat";

import { EmptyState, Loading, Screen } from "@/components/ui";
import {
  channelIdForActivity,
  connectStreamUser,
  getStreamClient,
} from "@/lib/stream";

export default function GameChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activityId = id!;
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = await connectStreamUser();
        const ch = client.channel("messaging", channelIdForActivity(activityId));
        await ch.watch();
        if (active) setChannel(ch);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Chat unavailable.");
      }
    })();
    return () => {
      active = false;
    };
  }, [activityId]);

  if (error) {
    return (
      <Screen>
        <EmptyState title="Chat unavailable" message={error} />
      </Screen>
    );
  }

  if (!channel) return <Loading />;

  return (
    <OverlayProvider>
      <Chat client={getStreamClient()}>
        <ChannelComponent channel={channel}>
          <MessageList />
          <MessageInput />
        </ChannelComponent>
      </Chat>
    </OverlayProvider>
  );
}
