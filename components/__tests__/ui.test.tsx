import { render, fireEvent } from "@testing-library/react-native";

import { Button, EmptyState } from "@/components/ui";

describe("Button", () => {
  it("calls onPress when enabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Join game" onPress={onPress} />);
    fireEvent.press(getByText("Join game"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Game full" onPress={onPress} disabled />);
    fireEvent.press(getByText("Game full"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress while loading", () => {
    const onPress = jest.fn();
    const { queryByText } = render(<Button title="Saving" onPress={onPress} loading />);
    // Title is replaced by a spinner while loading.
    expect(queryByText("Saving")).toBeNull();
  });
});

describe("EmptyState", () => {
  it("renders title and message", () => {
    const { getByText } = render(
      <EmptyState title="No games nearby" message="Be the first to host one." />,
    );
    expect(getByText("No games nearby")).toBeTruthy();
    expect(getByText("Be the first to host one.")).toBeTruthy();
  });
});
