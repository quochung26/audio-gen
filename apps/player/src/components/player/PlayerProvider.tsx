"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { saveProgress } from "@/app/actions/interactions";

export interface Track {
  episodeId: string;
  title: string;
  seriesTitle: string;
  seriesSlug: string;
  src: string;
  durationMs: number;
  /** URL ảnh bìa, để hiện trên màn hình khoá. */
  coverUrl?: string;
  /** Vị trí đã lưu ở máy chủ (chỉ có khi đã đăng nhập). */
  serverPositionMs?: number;
  /** Tập kế tiếp, để tự phát tiếp. */
  nextEpisodeId?: string;
}

interface PlayerState {
  track: Track | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  rate: number;
  /** Mốc thời gian (epoch ms) sẽ tự dừng; null = không hẹn giờ. */
  sleepAt: number | null;
  play: (t: Track) => void;
  toggle: () => void;
  seek: (ms: number) => void;
  skip: (deltaMs: number) => void;
  setRate: (r: number) => void;
  setSleepMinutes: (m: number | null) => void;
}

const Ctx = createContext<PlayerState | null>(null);

/** Nhớ vị trí nghe theo tập. localStorage đủ dùng — chưa cần tài khoản. */
const POS_KEY = "audio-truyen:pos";
const RATE_KEY = "audio-truyen:rate";

function readPositions(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function getSavedPosition(episodeId: string): number {
  return readPositions()[episodeId] ?? 0;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [rate, setRateState] = useState(1);
  const [sleepAt, setSleepAt] = useState<number | null>(null);

  // Tạo thẻ audio một lần và giữ ngoài React tree: nếu để trong JSX thì mỗi
  // lần điều hướng trang là component remount và nhạc đứt.
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;

    const savedRate = Number(localStorage.getItem(RATE_KEY) ?? 1);
    if (savedRate > 0) {
      el.playbackRate = savedRate;
      setRateState(savedRate);
    }

    const onTime = () => setPositionMs(el.currentTime * 1000);
    const onMeta = () => setDurationMs(el.duration * 1000);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);

    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  // Lưu vị trí mỗi 5 giây, không lưu mỗi timeupdate (bắn ~4 lần/giây).
  useEffect(() => {
    if (!track) return;
    const id = setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused) return;
      const positions = readPositions();
      positions[track.episodeId] = el.currentTime * 1000;
      localStorage.setItem(POS_KEY, JSON.stringify(positions));
    }, 5000);
    return () => clearInterval(id);
  }, [track]);

  // Đồng bộ lên máy chủ THƯA hơn nhiều — mỗi 15 giây thay vì 5.
  //
  // localStorage ghi là xong; gửi lên máy chủ là một lượt mạng cộng một lượt
  // ghi DB. Nghe một tập 20 phút mà gửi mỗi 5 giây là 240 lượt cho một người.
  // Sai lệch 15 giây khi đổi máy không ai để ý.
  //
  // Chưa đăng nhập thì `saveProgress` tự bỏ qua, ở đây không cần biết.
  useEffect(() => {
    if (!track) return;
    const id = setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused) return;
      void saveProgress(track.episodeId, el.currentTime * 1000).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [track]);

  // Hẹn giờ tắt — thứ quan trọng nhất với truyện nghe trước khi ngủ.
  useEffect(() => {
    if (sleepAt === null) return;
    const id = setInterval(() => {
      if (Date.now() >= sleepAt) {
        audioRef.current?.pause();
        setSleepAt(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepAt]);

  const play = useCallback((t: Track) => {
    const el = audioRef.current;
    if (!el) return;

    if (track?.episodeId === t.episodeId) {
      void el.play();
      return;
    }

    setTrack(t);
    el.src = t.src;
    // Lấy vị trí XA HƠN giữa máy này và máy chủ. Nghe tiếp ở điện thoại rồi
    // quay lại laptop mà lấy vị trí của laptop là bị lùi lại chỗ cũ.
    el.currentTime = Math.max(getSavedPosition(t.episodeId), t.serverPositionMs ?? 0) / 1000;
    void el.play();

    // Điều khiển từ màn hình khoá / tai nghe.
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.seriesTitle,
        album: "Audio Truyện",
        // Ảnh hiện trên màn hình khoá và tai nghe. Không có bìa thì bỏ hẳn —
        // đưa mảng rỗng thì một số máy hiện ô xám thay vì icon app.
        ...(t.coverUrl ? { artwork: [{ src: t.coverUrl }] } : {}),
      });
      navigator.mediaSession.setActionHandler("play", () => void el.play());
      navigator.mediaSession.setActionHandler("pause", () => el.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        el.currentTime = Math.max(0, el.currentTime - 15);
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        el.currentTime = Math.min(el.duration, el.currentTime + 15);
      });
    }
  }, [track]);

  // Tự phát tập tiếp theo khi hết tập — trừ khi đang hẹn giờ tắt.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track) return;

    const onEnded = () => {
      const positions = readPositions();
      delete positions[track.episodeId];
      localStorage.setItem(POS_KEY, JSON.stringify(positions));

      if (track.nextEpisodeId && sleepAt === null) {
        window.location.href = `/nghe/${track.nextEpisodeId}?autoplay=1`;
      }
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [track, sleepAt]);

  const value = useMemo<PlayerState>(
    () => ({
      track,
      playing,
      positionMs,
      durationMs,
      rate,
      sleepAt,
      play,
      toggle: () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) void el.play();
        else el.pause();
      },
      seek: (ms) => {
        const el = audioRef.current;
        if (el) el.currentTime = ms / 1000;
      },
      skip: (deltaMs) => {
        const el = audioRef.current;
        if (el) el.currentTime = Math.max(0, el.currentTime + deltaMs / 1000);
      },
      setRate: (r) => {
        const el = audioRef.current;
        if (el) el.playbackRate = r;
        setRateState(r);
        localStorage.setItem(RATE_KEY, String(r));
      },
      setSleepMinutes: (m) => setSleepAt(m === null ? null : Date.now() + m * 60_000),
    }),
    [track, playing, positionMs, durationMs, rate, sleepAt, play],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer phải nằm trong PlayerProvider");
  return ctx;
}
