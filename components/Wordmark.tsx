import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/components/theme";

/**
 * The Turnout wordmark: Archivo black, a marigold full-stop, and the brand's
 * signature −6° forward shear (everything in Turnout leans into motion).
 */
export function Wordmark({ size = 56 }: { size?: number }) {
  return (
    <View style={styles.skew}>
      <Text style={[styles.word, { fontSize: size }]}>
        Turnout<Text style={styles.dot}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skew: { transform: [{ skewX: "-6deg" }] },
  word: {
    fontFamily: fonts.displayBlack,
    color: colors.text,
    letterSpacing: -2,
    lineHeight: undefined,
  },
  dot: { color: colors.primary },
});
