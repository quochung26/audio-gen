import { connection } from "../lib/redis";
import { logger } from "../lib/logger";

/**
 * Đẩy chữ đang sinh về Studio, theo thời gian thực.
 *
 * Vì sao qua Redis: worker và API là hai tiến trình. Token nằm ở worker, còn
 * Studio chỉ nói chuyện được với API. Redis đã có sẵn cho hàng đợi nên không
 * thêm hạ tầng nào.
 *
 * Khoá theo TẬP chứ không theo cảnh: trang tập chỉ phải hỏi một chỗ, và job
 * viết cả tập đi lần lượt qua từng cảnh vẫn dùng đúng khoá đó.
 *
 * Có HẠN GIỜ: bản nháp dở là thứ dùng xong bỏ. Worker chết giữa chừng thì khoá
 * tự hết hạn, không để lại rác mà cũng chẳng ai phải đi dọn.
 *
 * KHÔNG BAO GIỜ được làm chết job. Đây là thứ trang trí — Redis trục trặc thì
 * mất phần xem trực tiếp, chứ không mất cảnh vừa viết.
 */
const TTL_SECONDS = 300;

/** Ghi tối đa hai lần mỗi giây. Ollama trả về hàng trăm mẩu nhỏ mỗi cảnh. */
const WRITE_EVERY_MS = 500;

export const streamKey = (episodeId: string) => `stream:episode:${episodeId}`;

export interface SceneStream {
  push(chunk: string): void;
  /** Xoá khoá khi xong — bản chính thức đã nằm trong DB, giữ nháp lại chỉ gây lệch. */
  finish(): Promise<void>;
}

export function openSceneStream(input: {
  episodeId: string;
  sceneId: string;
  order: number;
}): SceneStream {
  let text = "";
  let lastWrite = 0;
  let writing = false;

  async function flush() {
    if (writing) return;
    writing = true;
    try {
      await connection.set(
        streamKey(input.episodeId),
        JSON.stringify({ sceneId: input.sceneId, order: input.order, text }),
        "EX",
        TTL_SECONDS,
      );
    } catch (err) {
      logger.debug(`[stream] không ghi được: ${(err as Error).message}`);
    } finally {
      writing = false;
    }
  }

  return {
    push(chunk) {
      text += chunk;
      const now = Date.now();
      if (now - lastWrite < WRITE_EVERY_MS) return;
      lastWrite = now;
      void flush();
    },
    async finish() {
      try {
        await connection.del(streamKey(input.episodeId));
      } catch {
        // Hết hạn sau TTL_SECONDS là xong, không cần làm gì thêm.
      }
    },
  };
}
