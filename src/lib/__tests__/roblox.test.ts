import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveUserByUsername } from "@/lib/roblox";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("resolveUserByUsername", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("mencari username dengan format asli agar variasi kapital Roblox tetap ditemukan", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        data: [
          {
            requestedUsername: "Valid_User",
            hasVerifiedBadge: false,
            id: 12345,
            name: "Valid_User",
            displayName: "Valid User",
          },
        ],
      }),
    });

    const user = await resolveUserByUsername(" Valid_User ");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      usernames: ["Valid_User"],
      excludeBannedUsers: false,
    });
    expect(user).toEqual({
      id: 12345,
      name: "Valid_User",
      displayName: "Valid User",
    });
  });
});
