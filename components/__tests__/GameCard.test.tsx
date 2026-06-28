import { render, fireEvent } from "@testing-library/react-native";

import { GameCard, type GameCardData } from "@/components/GameCard";

const base: GameCardData = {
  id: "g1",
  title: "Sunday 5-a-side",
  venue_label: "Weybridge Sports Hub",
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  status: "open",
  max_players: 10,
  format: "5-a-side",
  joined_count: 7,
  distance_meters: 850,
};

describe("GameCard", () => {
  it("renders title, venue, roster and format tag", () => {
    const { getByText } = render(<GameCard game={base} onPress={() => {}} />);
    expect(getByText("Sunday 5-a-side")).toBeTruthy();
    expect(getByText(/Weybridge Sports Hub/)).toBeTruthy();
    expect(getByText(/7 \/ 10 going/)).toBeTruthy();
    expect(getByText("5-A-SIDE")).toBeTruthy();
  });

  it("shows the 'FULL' tag and the distance chip", () => {
    const { getByText } = render(
      <GameCard game={{ ...base, status: "full", joined_count: 10 }} onPress={() => {}} />,
    );
    expect(getByText("FULL")).toBeTruthy();
    expect(getByText("850 M")).toBeTruthy();
  });

  it("falls back to '<max> max' when joined_count is absent", () => {
    const { getByText } = render(
      <GameCard game={{ ...base, joined_count: undefined }} onPress={() => {}} />,
    );
    expect(getByText(/10 max/)).toBeTruthy();
  });

  it("defaults the format tag to FOOTBALL when none is given", () => {
    const { getByText } = render(
      <GameCard game={{ ...base, format: undefined }} onPress={() => {}} />,
    );
    expect(getByText("FOOTBALL")).toBeTruthy();
  });

  it("leads with the sport label for non-football activities", () => {
    const { getByText, queryByText } = render(
      <GameCard game={{ ...base, activity_type: "gym", format: "5-a-side" }} onPress={() => {}} />,
    );
    expect(getByText("GYM")).toBeTruthy();
    // football format is suppressed for other sports
    expect(queryByText("5-A-SIDE")).toBeNull();
  });

  it("still leads with the format for football", () => {
    const { getByText } = render(
      <GameCard game={{ ...base, activity_type: "football", format: "7-a-side" }} onPress={() => {}} />,
    );
    expect(getByText("7-A-SIDE")).toBeTruthy();
  });

  it("fires onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByText } = render(<GameCard game={base} onPress={onPress} />);
    fireEvent.press(getByText("Sunday 5-a-side"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
