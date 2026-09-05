import { describe, expect, it } from "vitest";
import { isEpisodeComplete, nextStep, type BatchOptions, type EpisodeProgress } from "./batch-plan";

const fresh: EpisodeProgress = {
  humanReviewed: false,
  hasDraft: false,
  needsTranslate: false,
  blocksTotal: 0,
  blocksWithAudio: 0,
  hasSummary: false,
  hasMp3: false,
};

const ep = (over: Partial<EpisodeProgress> = {}): EpisodeProgress => ({ ...fresh, ...over });

const manual: BatchOptions = { autoApprove: false, withAudio: true };
const auto: BatchOptions = { autoApprove: true, withAudio: true };
const noAudio: BatchOptions = { autoApprove: true, withAudio: false };

describe("chuỗi bước đầy đủ", () => {
  it("đi đúng thứ tự từ tập trắng tới MP3", () => {
    const seen: string[] = [];
    let e = ep();

    for (let i = 0; i < 10; i++) {
      const s = nextStep(e, auto);
      if (s.kind === "done") break;
      seen.push(s.kind === "job" ? s.type : s.kind);

      // Mô phỏng kết quả của từng bước.
      if (s.kind === "approve") e = { ...e, humanReviewed: true };
      else if (s.kind === "wait-review") throw new Error("autoApprove bật mà vẫn đòi duyệt tay");
      else if (s.type === "WRITE_SCENE") e = { ...e, hasDraft: true };
      else if (s.type === "TRANSLATE") e = { ...e, needsTranslate: false };
      else if (s.type === "AUDIO_EDIT") e = { ...e, blocksTotal: 12 };
      else if (s.type === "SUMMARIZE") e = { ...e, hasSummary: true };
      else if (s.type === "TTS") e = { ...e, blocksWithAudio: e.blocksTotal };
      else if (s.type === "MIX") e = { ...e, hasMp3: true };
    }

    expect(seen).toEqual([
      "WRITE_SCENE",
      "approve",
      "AUDIO_EDIT",
      "SUMMARIZE",
      "TTS",
      "MIX",
    ]);
    expect(nextStep(e, auto)).toEqual({ kind: "done" });
  });
});

describe("chốt duyệt bản thảo", () => {
  it("dừng chờ người đọc khi không bật autoApprove", () => {
    expect(nextStep(ep({ hasDraft: true }), manual)).toEqual({ kind: "wait-review" });
  });

  it("KHÔNG bao giờ nhảy qua bước duyệt khi autoApprove tắt", () => {
    // Dù mọi thứ khác đã sẵn sàng, chưa duyệt là vẫn phải dừng. Đây là chốt
    // chặn duy nhất ngăn bản thảo thô thành audio.
    const e = ep({ hasDraft: true, blocksTotal: 5, hasSummary: true });
    expect(nextStep(e, manual)).toEqual({ kind: "wait-review" });
  });

  it("bật autoApprove thì tự duyệt rồi đi tiếp", () => {
    expect(nextStep(ep({ hasDraft: true }), auto)).toEqual({ kind: "approve" });
  });

  it("đã duyệt tay rồi thì không hỏi lại", () => {
    expect(nextStep(ep({ hasDraft: true, humanReviewed: true }), manual)).toEqual({
      kind: "job",
      type: "AUDIO_EDIT",
    });
  });
});

describe("bước chuyển ngữ", () => {
  const drafted = ep({ hasDraft: true, needsTranslate: true });

  it("chạy NGAY SAU khi viết xong, trước chốt duyệt", () => {
    // Duyệt bản thảo ở thứ tiếng không phát ra loa thì chốt chặn không chặn
    // được gì: thứ người đọc gật đầu khác thứ người nghe nhận được.
    expect(nextStep(drafted, manual)).toEqual({ kind: "job", type: "TRANSLATE" });
    expect(nextStep(drafted, auto)).toEqual({ kind: "job", type: "TRANSLATE" });
  });

  it("autoApprove KHÔNG lách qua nó", () => {
    expect(nextStep(drafted, auto)).not.toEqual({ kind: "approve" });
  });

  it("chưa viết xong thì viết trước đã", () => {
    expect(nextStep(ep({ needsTranslate: true }), auto)).toEqual({
      kind: "job",
      type: "WRITE_SCENE",
    });
  });

  it("chuyển ngữ xong mới tới lượt duyệt", () => {
    expect(nextStep(ep({ hasDraft: true, needsTranslate: false }), manual)).toEqual({
      kind: "wait-review",
    });
  });

  it("bộ viết thẳng thì không có bước này trong cả chuỗi", () => {
    // `needsTranslate` luôn false với bộ không đặt ngôn ngữ bản thảo — bước này
    // không được xen vào chuỗi cũ ở bất kỳ chỗ nào.
    const seen: string[] = [];
    let e = ep();
    for (let i = 0; i < 10; i++) {
      const s = nextStep(e, auto);
      if (s.kind === "done") break;
      seen.push(s.kind === "job" ? s.type : s.kind);
      if (s.kind === "approve") e = { ...e, humanReviewed: true };
      else if (s.kind === "job" && s.type === "WRITE_SCENE") e = { ...e, hasDraft: true };
      else if (s.kind === "job" && s.type === "AUDIO_EDIT") e = { ...e, blocksTotal: 4 };
      else if (s.kind === "job" && s.type === "SUMMARIZE") e = { ...e, hasSummary: true };
      else if (s.kind === "job" && s.type === "TTS") e = { ...e, blocksWithAudio: e.blocksTotal };
      else if (s.kind === "job" && s.type === "MIX") e = { ...e, hasMp3: true };
    }
    expect(seen).not.toContain("TRANSLATE");
  });

  it("tập còn cảnh chưa chuyển ngữ thì CHƯA xong, dù đã đủ audio", () => {
    // Viết lại một cảnh giữa chừng làm `sourceText` về null; lượt chạy phải
    // quay lại chuyển ngữ chứ không được coi tập là đã khép.
    const e = ep({
      hasDraft: true,
      humanReviewed: true,
      needsTranslate: true,
      blocksTotal: 6,
      blocksWithAudio: 6,
      hasSummary: true,
      hasMp3: true,
    });
    expect(isEpisodeComplete(e, auto)).toBe(false);
  });
});

describe("withAudio", () => {
  const scripted = ep({ hasDraft: true, humanReviewed: true, blocksTotal: 8, hasSummary: true });

  it("tắt thì dừng sau tóm tắt, không chạy TTS", () => {
    expect(nextStep(scripted, noAudio)).toEqual({ kind: "done" });
    expect(isEpisodeComplete(scripted, noAudio)).toBe(true);
  });

  it("bật thì chạy tiếp TTS", () => {
    expect(nextStep(scripted, auto)).toEqual({ kind: "job", type: "TTS" });
    expect(isEpisodeComplete(scripted, auto)).toBe(false);
  });
});

describe("TTS dở dang", () => {
  const base = { hasDraft: true, humanReviewed: true, hasSummary: true, blocksTotal: 10 };

  it("còn block chưa có audio thì chạy lại TTS", () => {
    expect(nextStep(ep({ ...base, blocksWithAudio: 7 }), auto)).toEqual({
      kind: "job",
      type: "TTS",
    });
  });

  it("đủ audio thì sang MIX", () => {
    expect(nextStep(ep({ ...base, blocksWithAudio: 10 }), auto)).toEqual({
      kind: "job",
      type: "MIX",
    });
  });

  it("đã có MP3 thì xong", () => {
    expect(nextStep(ep({ ...base, blocksWithAudio: 10, hasMp3: true }), auto)).toEqual({
      kind: "done",
    });
  });
});

describe("xét theo dữ liệu, không theo status", () => {
  it("có kịch bản nhưng chưa có tóm tắt thì làm tóm tắt, không viết lại cảnh", () => {
    // Tình huống thật: người dùng bấm tay AUDIO_EDIT trong Studio rồi mới bật
    // chạy hàng loạt. Không được viết đè lên bản thảo đã có.
    const e = ep({ hasDraft: true, humanReviewed: true, blocksTotal: 20 });
    expect(nextStep(e, auto)).toEqual({ kind: "job", type: "SUMMARIZE" });
  });

  it("tập đã xong hoàn toàn thì bỏ qua", () => {
    const e = ep({
      hasDraft: true,
      humanReviewed: true,
      blocksTotal: 6,
      blocksWithAudio: 6,
      hasSummary: true,
      hasMp3: true,
    });
    expect(isEpisodeComplete(e, auto)).toBe(true);
    expect(isEpisodeComplete(e, manual)).toBe(true);
  });

  it("tập chưa có block nào KHÔNG bị coi là đã xong", () => {
    // blocksWithAudio >= blocksTotal cũng đúng khi cả hai bằng 0 — nếu chỉ so
    // hai số đó thì tập chưa tách block sẽ bị tưởng là đọc xong rồi.
    const e = ep({ hasDraft: true, humanReviewed: true, hasSummary: true });
    expect(nextStep(e, auto)).toEqual({ kind: "job", type: "AUDIO_EDIT" });
  });
});
