import { describe, expect, it } from "vitest";
import { syncState, type SyncInput } from "./sync-state";

const T = (ms: number) => new Date(1_700_000_000_000 + ms);

const base: SyncInput = {
  status: "PUBLISHED",
  syncedAt: T(10_000),
  episodeUpdatedAt: T(0),
  blocksUpdatedAt: T(0),
  exportsUpdatedAt: T(0),
};

describe("syncState", () => {
  it("chưa xuất bản thì không xét lệch", () => {
    expect(syncState({ ...base, status: "READY", syncedAt: null })).toBe("chưa xuất bản");
  });

  it("đã xuất bản mà chưa từng đồng bộ", () => {
    expect(syncState({ ...base, syncedAt: null })).toBe("chưa đồng bộ lần nào");
  });

  it("không sửa gì sau khi đồng bộ thì sạch", () => {
    expect(syncState(base)).toBe("đã đồng bộ");
  });

  it("sửa TIÊU ĐỀ sau khi đồng bộ → lệch", () => {
    expect(syncState({ ...base, episodeUpdatedAt: T(60_000) })).toBe("đã lệch");
  });

  it("tạo lại KỊCH BẢN sau khi đồng bộ → lệch", () => {
    // Chỉ nhìn Episode.updatedAt là bỏ sót kiểu này.
    expect(syncState({ ...base, blocksUpdatedAt: T(60_000) })).toBe("đã lệch");
  });

  it("xuất lại MP3 sau khi đồng bộ → lệch", () => {
    expect(syncState({ ...base, exportsUpdatedAt: T(60_000) })).toBe("đã lệch");
  });

  it("vừa đồng bộ xong — hai mốc BẰNG NHAU — thì sạch", () => {
    // Job đặt updatedAt bằng đúng syncedAt lúc đóng dấu, nên đây là tình huống
    // ngay sau mỗi lần đồng bộ.
    expect(syncState({ ...base, episodeUpdatedAt: base.syncedAt! })).toBe("đã đồng bộ");
  });

  it("sửa NGAY SAU khi đồng bộ vẫn phải bắt được", () => {
    // Từng dùng đệm 5 giây ở đây và nó che mất đúng tình huống này — sửa tiêu
    // đề một giây sau khi đồng bộ mà vẫn báo "đã đồng bộ".
    expect(syncState({ ...base, episodeUpdatedAt: T(10_001) })).toBe("đã lệch");
  });

  it("tập chưa có block hay bản xuất vẫn xét được", () => {
    expect(syncState({ ...base, blocksUpdatedAt: null, exportsUpdatedAt: null })).toBe(
      "đã đồng bộ",
    );
  });

  it("lấy mốc MỚI NHẤT trong ba nguồn", () => {
    expect(
      syncState({ ...base, episodeUpdatedAt: T(0), blocksUpdatedAt: T(0), exportsUpdatedAt: T(99_000) }),
    ).toBe("đã lệch");
  });
});
