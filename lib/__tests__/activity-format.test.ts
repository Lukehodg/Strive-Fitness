import { statusLabel } from "@/lib/activity-format";

describe("statusLabel", () => {
  it("maps each status to a human label", () => {
    expect(statusLabel("open")).toBe("Open");
    expect(statusLabel("full")).toBe("Full");
    expect(statusLabel("cancelled")).toBe("Cancelled");
    expect(statusLabel("completed")).toBe("Finished");
  });
});
