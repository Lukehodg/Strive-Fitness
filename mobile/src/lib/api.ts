export type Account = {
  id: number;
  username: string;
  displayName: string;
  timezone: string;
  dailyCalorieTarget: number | null;
  dailyProteinTarget: number | null;
  dailyCarbsTarget: number | null;
  dailyFatTarget: number | null;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  token: string | null,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!base)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to your Strive server before signing in.",
    );
  if (!__DEV__ && !base.startsWith("https://"))
    throw new Error("Release builds require a secure HTTPS server.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(base + path, {
      method,
      signal: controller.signal,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "X-Strive-Request": "1",
        "X-Strive-Client": "native",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        data.message || "The request failed.",
        response.status,
      );
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
