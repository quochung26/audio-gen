/**
 * Interface strings for the player, per locale.
 *
 * `vi` is the reference shape and `en` is typed as `Dict`, so a key added to one and
 * forgotten in the other is a typecheck error rather than a blank patch of UI. That
 * matters here because the two dictionaries are edited at different times — the
 * Vietnamese one when writing a feature, the English one afterwards.
 *
 * Deliberately a plain module rather than a library: this is one object per language and
 * a lookup, and the player's test setup can only load `.ts` files (see vitest.config.ts),
 * so keeping it dependency-free keeps it testable.
 *
 * Values are either strings or functions taking the interpolated parts. Functions rather
 * than `{count}` placeholders so the argument types are checked — a renamed placeholder
 * fails the build instead of printing `{count}` to a listener.
 */
// From `@audio/core/language`, NOT the package root: the root barrel reaches `password.ts`
// and its `node:crypto` import, and this module is bundled for the browser through
// LocaleProvider. Pulling in the barrel fails the build with an unhandled "node:" scheme.
import { DEFAULT_LANGUAGE, isLanguage, type LanguageCode } from "@audio/core/language";

export type Locale = LanguageCode;

export const LOCALES: readonly Locale[] = ["vi", "en"];
export const DEFAULT_LOCALE: Locale = DEFAULT_LANGUAGE;

const vi = {
  // Shell
  siteDescription: "Nghe truyện ngắn và truyện dài",
  favourites: "Yêu thích",
  signIn: "Đăng nhập",
  signOut: "Thoát",
  account: "Tài khoản",

  // Home
  nothingPublished: "Chưa có tập nào được xuất bản.",
  nothingPublishedHint: "Vào Studio, mở một tập đã có audio rồi bấm “Xuất bản”.",
  latestEpisodes: "Tập mới nhất",
  allStories: "Tất cả truyện",
  allGenreStories: (genre: string) => `Tất cả truyện ${genre}`,
  recentlyUpdated: "Mới cập nhật",
  episodeCount: (n: number) => `${n} tập`,
  ongoingSuffix: " · đang ra",
  continueListening: "Tiếp tục nghe",
  timeLeft: (t: string) => `còn ${t}`,
  underAMinute: "dưới 1 phút",
  unknownLength: "—",

  // Filters
  allGenres: "Tất cả",
  allLanguages: "Mọi thứ tiếng",

  // Story page
  listenInPodcastApp: "Nghe bằng app podcast (RSS)",
  aiDisclosure: "Nội dung có sự hỗ trợ của AI.",

  // Episode page
  episodeTitle: (n: number, title: string) => `Tập ${n}: ${title}`,
  autoplayNote: "Hết tập sẽ tự chuyển sang",
  autoplayNoteTail: "— trừ khi đang hẹn giờ tắt.",
  readTranscript: "Đọc lời truyện",
  listener: "Người nghe",

  // Player controls
  play: "Phát",
  pause: "Tạm dừng",
  resume: "Nghe tiếp",
  playbackPosition: "Vị trí phát",
  back15: "Lùi 15 giây",
  forward15: "Tiến 15 giây",
  sleepTimer: "Hẹn giờ tắt",
  cancelTimer: "huỷ hẹn giờ",
  minutes: (m: number) => `${m} phút`,
  stopsIn: (t: string) => ` · tắt sau ${t}`,

  // Offline
  downloaded: "Đã tải về — nghe được khi mất mạng",
  removeFromDevice: "xoá khỏi máy",
  downloading: "Đang tải…",
  downloadForOffline: (size: string) => `Tải về nghe offline${size}`,
  downloadFailed: (reason: string) => `Tải không xong: ${reason}`,
  unknownError: "không rõ",

  // Favourites + ratings
  signInToSaveFavourites: "Đăng nhập để lưu yêu thích",
  saved: "★ Đã lưu",
  saveToFavourites: "☆ Lưu yêu thích",
  nothingSavedYet: "Chưa lưu tập nào. Bấm",
  nothingSavedYetTail: "ở trang tập.",
  signInToRate: "Đăng nhập để đánh giá",
  ratingSummary: (avg: string, n: number) => `${avg} sao · ${n} lượt`,
  noRatingsYet: "chưa có đánh giá",

  // Comments
  comments: (n: number) => `Bình luận (${n})`,
  commentPlaceholder: "Nghĩ gì về tập này?",
  posting: "Đang gửi…",
  post: "Gửi",
  commentsNeedApproval: "Bình luận hiện sau khi được duyệt.",
  signInToComment: "để bình luận.",
  noCommentsYet: "Chưa có bình luận nào.",
  atTimestamp: (t: string) => `tại ${t}`,

  // Auth
  signUp: "Đăng ký",
  createAccount: "Tạo tài khoản",
  signInWithGoogle: "Đăng nhập bằng Google",
  or: "hoặc",
  password: "Mật khẩu",
  passwordWithHint: "Mật khẩu — ít nhất 8 ký tự",
  displayNameOptional: "Tên hiển thị (tuỳ chọn)",
  noAccountYet: "Chưa có tài khoản?",
  haveAccount: "Đã có tài khoản?",
  signInBlurb: "Đăng nhập để đồng bộ vị trí nghe giữa các máy và lưu truyện yêu thích.",
  signInOptional: "Không đăng nhập vẫn nghe được bình thường — vị trí nghe lưu trên chính máy này.",
  signUpBlurb: "Chỉ cần email và mật khẩu. Không cần xác minh gì thêm.",
  working: "Đang xử lý…",

  // Server-action replies — rendered straight into the page, so they follow the page.
  errSignInFavourite: "Đăng nhập để lưu truyện yêu thích.",
  errSignInRate: "Đăng nhập để đánh giá.",
  errSignInComment: "Đăng nhập để bình luận.",
  errEpisodeNotFound: "Không tìm thấy tập này.",
  errScoreRange: "Điểm phải từ 1 tới 5 sao.",
  errCommentTooShort: "Bình luận quá ngắn.",
  errCommentTooLong: (n: number) => `Bình luận tối đa ${n} ký tự.`,
  errCommentTooFast: "Gửi hơi nhanh. Đợi nửa phút rồi gửi tiếp.",
  okFavouriteAdded: "Đã lưu vào yêu thích.",
  okFavouriteRemoved: "Đã bỏ khỏi yêu thích.",
  okRated: (n: number) => `Đã chấm ${n} sao.`,
  okCommentPosted: "Đã gửi. Bình luận sẽ hiện sau khi được duyệt.",
  errEmailInvalid: "Email không hợp lệ",
  errPasswordTooShort: (n: number) => `Mật khẩu phải từ ${n} ký tự trở lên`,
  errTooManyAttempts: "Thử quá nhiều lần. Đợi ít phút rồi thử lại.",
  errCannotCreateAccount: "Không tạo được tài khoản với email này. Nếu đã có, hãy đăng nhập.",
  errWrongCredentials: "Email hoặc mật khẩu không đúng.",

  // Errors
  notFound: "Không có truyện này, hoặc chưa tập nào được xuất bản.",
  backHome: "về trang chủ",
  loadFailed: "Không tải được nội dung.",
  logReference: (digest: string) => `Mã tra log: ${digest}`,
  tryAgain: "Thử lại",
};

/**
 * The shape every locale has to provide.
 *
 * Taken from `vi` WITHOUT `as const`, so a string stays `string` rather than narrowing to
 * its own Vietnamese text — otherwise `en` could only ever be assigned the same words.
 * Function members keep their signatures, which is the part worth locking down.
 */
export type Dict = typeof vi;

const en: Dict = {
  siteDescription: "Short stories and serials, read aloud",
  favourites: "Favourites",
  signIn: "Sign in",
  signOut: "Sign out",
  account: "Account",

  nothingPublished: "No episodes published yet.",
  nothingPublishedHint: "Open Studio, pick an episode that has audio, and click “Publish”.",
  latestEpisodes: "Latest episodes",
  allStories: "All stories",
  allGenreStories: (genre: string) => `All ${genre} stories`,
  recentlyUpdated: "Recently updated",
  episodeCount: (n: number) => `${n} ${n === 1 ? "episode" : "episodes"}`,
  ongoingSuffix: " · ongoing",
  continueListening: "Continue listening",
  timeLeft: (t: string) => `${t} left`,
  underAMinute: "under 1 minute",
  unknownLength: "—",

  allGenres: "All",
  allLanguages: "All languages",

  listenInPodcastApp: "Listen in a podcast app (RSS)",
  aiDisclosure: "This content was made with AI assistance.",

  episodeTitle: (n: number, title: string) => `Episode ${n}: ${title}`,
  autoplayNote: "At the end it moves on to",
  autoplayNoteTail: "— unless a sleep timer is running.",
  readTranscript: "Read the transcript",
  listener: "Listener",

  play: "Play",
  pause: "Pause",
  resume: "Resume",
  playbackPosition: "Playback position",
  back15: "Back 15 seconds",
  forward15: "Forward 15 seconds",
  sleepTimer: "Sleep timer",
  cancelTimer: "cancel timer",
  minutes: (m: number) => `${m} min`,
  stopsIn: (t: string) => ` · stops in ${t}`,

  downloaded: "Downloaded — playable offline",
  removeFromDevice: "remove from device",
  downloading: "Downloading…",
  downloadForOffline: (size: string) => `Download for offline${size}`,
  downloadFailed: (reason: string) => `Download failed: ${reason}`,
  unknownError: "unknown",

  signInToSaveFavourites: "Sign in to save favourites",
  saved: "★ Saved",
  saveToFavourites: "☆ Save to favourites",
  nothingSavedYet: "Nothing saved yet. Click",
  nothingSavedYetTail: "on an episode page.",
  signInToRate: "Sign in to rate",
  ratingSummary: (avg: string, n: number) => `${avg} stars · ${n} ratings`,
  noRatingsYet: "no ratings yet",

  comments: (n: number) => `Comments (${n})`,
  commentPlaceholder: "What did you make of this episode?",
  posting: "Posting…",
  post: "Post",
  commentsNeedApproval: "Comments appear once approved.",
  signInToComment: "to comment.",
  noCommentsYet: "No comments yet.",
  atTimestamp: (t: string) => `at ${t}`,

  signUp: "Sign up",
  createAccount: "Create account",
  signInWithGoogle: "Sign in with Google",
  or: "or",
  password: "Password",
  passwordWithHint: "Password — at least 8 characters",
  displayNameOptional: "Display name (optional)",
  noAccountYet: "No account yet?",
  haveAccount: "Already have an account?",
  signInBlurb: "Sign in to sync your listening position across devices and save favourites.",
  signInOptional:
    "You can listen perfectly well without signing in — the position is kept on this device.",
  signUpBlurb: "Just an email and a password. Nothing else to verify.",
  working: "Working…",

  errSignInFavourite: "Sign in to save favourites.",
  errSignInRate: "Sign in to rate.",
  errSignInComment: "Sign in to comment.",
  errEpisodeNotFound: "Episode not found.",
  errScoreRange: "The score has to be 1 to 5 stars.",
  errCommentTooShort: "That comment is too short.",
  errCommentTooLong: (n: number) => `A comment is at most ${n} characters.`,
  errCommentTooFast: "That was quick. Wait half a minute before posting again.",
  okFavouriteAdded: "Saved to favourites.",
  okFavouriteRemoved: "Removed from favourites.",
  okRated: (n: number) => `Rated ${n} stars.`,
  okCommentPosted: "Posted. Your comment appears once it is approved.",
  errEmailInvalid: "That email is not valid",
  errPasswordTooShort: (n: number) => `The password must be at least ${n} characters`,
  errTooManyAttempts: "Too many attempts. Wait a few minutes and try again.",
  errCannotCreateAccount: "Could not create an account with this email. If you already have one, sign in.",
  errWrongCredentials: "Wrong email or password.",

  notFound: "No such story, or no episode has been published yet.",
  backHome: "back to the home page",
  loadFailed: "Could not load the content.",
  logReference: (digest: string) => `Log reference: ${digest}`,
  tryAgain: "Try again",
};

const DICTS: Record<Locale, Dict> = { vi, en };

export function dict(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

// ═══════════════════ URLs ═══════════════════

/**
 * The default locale carries NO prefix; every other locale is prefixed.
 *
 * Chosen so that every URL published before this feature existed keeps working — including
 * the podcast RSS links already handed to listeners' apps, which nobody can go back and
 * update. Prefixing the default too would have 404'd all of them.
 */
export function localeHref(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return locale === DEFAULT_LOCALE ? clean : `/${locale}${clean === "/" ? "" : clean}`;
}

/**
 * Split a request path into its locale and the rest.
 *
 * The rest ALWAYS starts with "/" so it can be handed straight to `localeHref` — returning
 * "" for the home page would make the language switcher build "/en" one time and "/enen"
 * the next, depending on the caller.
 */
export function splitLocale(pathname: string): { locale: Locale; rest: string } {
  const [, first = "", ...others] = pathname.split("/");
  if (isLanguage(first) && first !== DEFAULT_LOCALE) {
    return { locale: first, rest: `/${others.join("/")}` };
  }
  return { locale: DEFAULT_LOCALE, rest: pathname || "/" };
}

/**
 * Pick a locale from the `Accept-Language` header.
 *
 * Deliberately crude: it looks for the first supported tag by quality order and gives up to
 * the default otherwise. A full RFC 4647 match buys nothing here — there are two languages,
 * and getting it wrong costs one click on the language switcher.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // "en-GB" and "en" both mean English here.
    const base = tag.split("-")[0];
    if (isLanguage(base) && LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Which story language the catalogue is filtered to. `null` means every language.
 *
 * Defaults to the language being READ rather than showing everything: an audio story you
 * cannot understand is not a result, it is noise between the ones you can. `?lang=all` is
 * the way out, because hiding the rest outright would leave someone unable to reach a story
 * they know exists.
 *
 * The parameter is named the same in both languages, like every other word in the URL
 * vocabulary — one route tree serves both locales, rather than two that can drift apart.
 */
export function catalogueLanguage(param: string | undefined, locale: Locale): Locale | null {
  if (param === "all") return null;
  return isLanguage(param) ? param : locale;
}

/**
 * `alternates` metadata telling search engines this page's address in every language.
 *
 * Takes the path EXPLICITLY, and lives on each page rather than on the layout, because a
 * layout cannot know which sub-page is rendering at metadata time. Declared once for the
 * whole tree it pointed every page at the home page — which says the Vietnamese version of
 * `/en/sign-in` is `/`, worse than declaring nothing.
 */
export function localeAlternates(path: string) {
  return { languages: Object.fromEntries(LOCALES.map((l) => [l, localeHref(l, path)])) };
}

