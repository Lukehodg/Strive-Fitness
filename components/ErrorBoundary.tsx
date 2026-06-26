import { Component, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Heading, Muted } from "@/components/ui";
import { colors, font, spacing } from "@/components/theme";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time crashes anywhere below it and shows a recoverable screen
 * instead of a white screen. Wrap the app root with this. In production, report
 * `error` to Sentry from componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // TODO(prod): Sentry.captureException(error)
    console.error("[ErrorBoundary]", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Heading>Something went wrong</Heading>
          <Muted>The app hit an unexpected error. Try again.</Muted>
          {/* Surface the message so it can be read/screenshotted while testing. */}
          <ScrollView style={styles.details} contentContainerStyle={{ padding: spacing(3) }}>
            <Text style={styles.errorText}>{this.state.error.message}</Text>
          </ScrollView>
          <Button title="Reload" onPress={this.reset} style={{ marginTop: spacing(4) }} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing(8),
    gap: spacing(2),
  },
  details: {
    maxHeight: 160,
    alignSelf: "stretch",
    marginTop: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: { color: colors.danger, fontSize: font.small },
});
