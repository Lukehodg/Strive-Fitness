import { render, fireEvent } from "@testing-library/react-native";

import { GameCard, type GameCardData } from "@/components/GameCard";

const base: GameCardData = {
  id: "g1",
  title: "Sunday 5-a-side",
  venue_label: "Weybridge Sports Hub",
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  status: "open",
  max_players: 10,
  joined_count: 7,
  distance_meters: 850,
};

describe("GameCard", () => {
  it("renders title, venue, roster and status", () => {
    const { getByText } = render(<GameCard game={base} onPress={() => {}} />);
    expect(getByText("Sunday 5-a-side")).toBeTruthy();
    expect(getByText(/Weybridge Sports Hub/)).toBeTruthy();
    expect(getByText("7 / 10 going")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy();
  });

  it("shows 'Full' status and the distance label", () => {
    const { getByText } = render(
      <GameCard game={{ ...base, status: "full", joined_count: 10 }} onPress={() => {}} />,
    );
    expect(getByText("Full")).toBeTruthy();
    expect(getByText(/850 m away/)).toBeTruthy();
  });

  it("falls back to '<max> max' when joined_count is absent", () => {
    const { getByText } = render(
      <GameCard game={{ ...base, joined_count: undefined }} onPress={() => {}} />,
    );
    expect(getByText("10 max")).toBeTruthy();
  });

  it("fires onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByText } = render(<GameCard game={base} onPress={onPress} />);
    fireEvent.press(getByText("Sunday 5-a-side"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
