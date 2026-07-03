import { Platform } from "react-native";
import * as Calendar from "expo-calendar";

/**
 * Add a game to the user's device calendar. Returns false when permission is
 * denied or no writable calendar exists (the caller shows a settings hint).
 * Native module — works in dev/production builds, not Expo Go.
 */
export async function addGameToCalendar(input: {
  title: string;
  venueLabel: string;
  startsAt: string;
  durationMinutes: number;
}): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return false;

  let calendarId: string | undefined;
  if (Platform.OS === "ios") {
    calendarId = (await Calendar.getDefaultCalendarAsync())?.id;
  } else {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    calendarId = (
      calendars.find((c) => c.isPrimary && c.allowsModifications) ??
      calendars.find((c) => c.allowsModifications)
    )?.id;
  }
  if (!calendarId) return false;

  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  await Calendar.createEventAsync(calendarId, {
    title: input.title,
    location: input.venueLabel,
    startDate: start,
    endDate: end,
    notes: "Added from Turnout",
  });
  return true;
}
