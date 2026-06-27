import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";

import { colors, radius, spacing } from "@/components/theme";

/** A single pulsing placeholder block. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, { opacity }, style]} />;
}

/** Placeholder shaped like a GameCard, shown while the feed loads. */
export function GameCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={{ width: "60%", height: 18 }} />
      <Skeleton style={{ width: "40%", height: 12 }} />
      <Skeleton style={{ width: "80%", height: 12 }} />
      <Skeleton style={{ width: "30%", height: 12, marginTop: spacing(1) }} />
    </View>
  );
}

/** A column of card skeletons for list screens. */
export function GameListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ padding: spacing(5), gap: spacing(3.5) }}>
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(2),
  },
});
