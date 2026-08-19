/**
 * Telex Typing & Keystroke Biometrics Simulator
 *
 * Mô phỏng chuyển động ngón tay và sinh trắc học gõ phím của người thật:
 * 1. Bản đồ tọa độ phím 2D trên bàn phím chuẩn QWERTY để tính Flight Time (thời gian bay ngón tay).
 * 2. Dwell Time (thời gian giữ phím keydown -> keyup) theo phân phối chuẩn Gaussian.
 * 3. Chuyển đổi ký tự tiếng Việt có dấu sang chuỗi phím gõ Telex thực tế (ví dụ: 'đẹp' -> 'd', 'd', 'e', 'p', 'j').
 * 4. Mô phỏng gõ nhầm phím liền kề (Typo) -> Dừng 150-300ms -> Bấm Backspace -> Gõ lại phím đúng.
 */

import { randomGaussian } from "./bezier-curve";

// Tọa độ 2D của các phím trên bàn phím QWERTY chuẩn (đơn vị: khoảng cách key-cap)
export const QWERTY_LAYOUT: Record<string, { row: number; col: number }> = {
  "1": { row: 0, col: 0 }, "2": { row: 0, col: 1 }, "3": { row: 0, col: 2 }, "4": { row: 0, col: 3 }, "5": { row: 0, col: 4 },
  "6": { row: 0, col: 5 }, "7": { row: 0, col: 6 }, "8": { row: 0, col: 7 }, "9": { row: 0, col: 8 }, "0": { row: 0, col: 9 },
  "q": { row: 1, col: 0.5 }, "w": { row: 1, col: 1.5 }, "e": { row: 1, col: 2.5 }, "r": { row: 1, col: 3.5 }, "t": { row: 1, col: 4.5 },
  "y": { row: 1, col: 5.5 }, "u": { row: 1, col: 6.5 }, "i": { row: 1, col: 7.5 }, "o": { row: 1, col: 8.5 }, "p": { row: 1, col: 9.5 },
  "a": { row: 2, col: 0.8 }, "s": { row: 2, col: 1.8 }, "d": { row: 2, col: 2.8 }, "f": { row: 2, col: 3.8 }, "g": { row: 2, col: 4.8 },
  "h": { row: 2, col: 5.8 }, "j": { row: 2, col: 6.8 }, "k": { row: 2, col: 7.8 }, "l": { row: 2, col: 8.8 },
  "z": { row: 3, col: 1.2 }, "x": { row: 3, col: 2.2 }, "c": { row: 3, col: 3.2 }, "v": { row: 3, col: 4.2 }, "b": { row: 3, col: 5.2 },
  "n": { row: 3, col: 6.2 }, "m": { row: 3, col: 7.2 },
  " ": { row: 4, col: 4.5 },
};

// Các phím liền kề để sinh typo tự nhiên
const ADJACENT_KEYS: Record<string, string[]> = {
  a: ["q", "w", "s", "z"],
  b: ["v", "g", "h", "n"],
  c: ["x", "d", "f", "v"],
  d: ["e", "r", "f", "c", "x", "s"],
  e: ["w", "r", "d", "s"],
  f: ["r", "t", "g", "v", "c", "d"],
  g: ["t", "y", "h", "b", "v", "f"],
  h: ["y", "u", "j", "n", "b", "g"],
  i: ["u", "o", "k", "j"],
  j: ["u", "i", "k", "m", "n", "h"],
  k: ["i", "o", "l", "m", "j"],
  l: ["o", "p", "k"],
  m: ["j", "k", "n"],
  n: ["h", "j", "m", "b"],
  o: ["i", "p", "l", "k"],
  p: ["o", "l"],
  q: ["1", "2", "w", "a"],
  r: ["e", "t", "f", "d"],
  s: ["w", "e", "d", "x", "z", "a"],
  t: ["r", "y", "g", "f"],
  u: ["y", "i", "j", "h"],
  v: ["c", "f", "g", "b"],
  w: ["q", "e", "s", "a"],
  x: ["z", "s", "d", "c"],
  y: ["t", "u", "h", "g"],
  z: ["a", "s", "x"],
};

export interface KeystrokeAction {
  key: string;
  type: "keydown" | "keyup";
  /** Thời gian nghỉ trước khi kích hoạt sự kiện này */
  delayBeforeMs: number;
}

/**
 * Chuyển đổi chuỗi tiếng Việt sang chuỗi phím gõ Telex
 */
export function convertTextToTelexKeystrokes(text: string): string[] {
  // Bản đồ phân rã ký tự có dấu sang ký tự gốc + ký tự dấu Telex
  const telexMap: Record<string, string[]> = {
    // Dấu mũ / trăng / râu
    "ă": ["a", "w"], "ắ": ["a", "w", "s"], "ằ": ["a", "w", "f"], "ẳ": ["a", "w", "r"], "ẵ": ["a", "w", "x"], "ặ": ["a", "w", "j"],
    "â": ["a", "a"], "ấ": ["a", "a", "s"], "ầ": ["a", "a", "f"], "ẩ": ["a", "a", "r"], "ẫ": ["a", "a", "x"], "ậ": ["a", "a", "j"],
    "á": ["a", "s"], "à": ["a", "f"], "ả": ["a", "r"], "ã": ["a", "x"], "ạ": ["a", "j"],
    "đ": ["d", "d"],
    "ê": ["e", "e"], "ế": ["e", "e", "s"], "ề": ["e", "e", "f"], "ể": ["e", "e", "r"], "ễ": ["e", "e", "x"], "ệ": ["e", "e", "j"],
    "é": ["e", "s"], "è": ["e", "f"], "ẻ": ["e", "r"], "ẽ": ["e", "x"], "ẹ": ["e", "j"],
    "ô": ["o", "o"], "ố": ["o", "o", "s"], "ồ": ["o", "o", "f"], "ổ": ["o", "o", "r"], "ỗ": ["o", "o", "x"], "ộ": ["o", "o", "j"],
    "ơ": ["o", "w"], "ớ": ["o", "w", "s"], "ờ": ["o", "w", "f"], "ở": ["o", "w", "r"], "ỡ": ["o", "w", "x"], "ợ": ["o", "w", "j"],
    "ó": ["o", "s"], "ò": ["o", "f"], "ỏ": ["o", "r"], "õ": ["o", "x"], "ọ": ["o", "j"],
    "ư": ["u", "w"], "ứ": ["u", "w", "s"], "ừ": ["u", "w", "f"], "ử": ["u", "w", "r"], "ữ": ["u", "w", "x"], "ự": ["u", "w", "j"],
    "ú": ["u", "s"], "ù": ["u", "f"], "ủ": ["u", "r"], "ũ": ["u", "x"], "ụ": ["u", "j"],
    "í": ["i", "s"], "ì": ["i", "f"], "ỉ": ["i", "r"], "ĩ": ["i", "x"], "ị": ["i", "j"],
    "ý": ["y", "s"], "ỳ": ["y", "f"], "ỷ": ["y", "r"], "ỹ": ["y", "x"], "ỵ": ["y", "j"],
  };

  const keys: string[] = [];
  for (const char of text) {
    const lower = char.toLowerCase();
    if (telexMap[lower]) {
      keys.push(...telexMap[lower]);
    } else {
      keys.push(char);
    }
  }
  return keys;
}

/**
 * Tính toán thời gian bay ngón tay giữa 2 phím (Flight Time)
 */
export function calculateFlightTime(prevKey: string | null, currentKey: string): number {
  if (!prevKey) return 80 + Math.random() * 40;

  const p1 = QWERTY_LAYOUT[prevKey.toLowerCase()];
  const p2 = QWERTY_LAYOUT[currentKey.toLowerCase()];

  if (!p1 || !p2) return 90 + Math.random() * 50;

  const distance = Math.hypot(p2.col - p1.col, p2.row - p1.row);
  // Khoảng cách càng xa -> flight time càng lâu
  const baseFlight = 60 + distance * 25;
  return Math.max(45, Math.min(260, Math.round(randomGaussian(baseFlight, 20))));
}

/**
 * Sinh chuỗi các sự kiện bàn phím (keydown, keyup) với nhịp sinh học tự nhiên
 */
export function generateNaturalTypingPlan(
  text: string,
  options?: {
    typoRate?: number; // Mặc định 3% khả năng gõ nhầm
    speedWpm?: number; // Tốc độ gõ từ/phút (mặc định 55 WPM)
  },
): KeystrokeAction[] {
  const keys = convertTextToTelexKeystrokes(text);
  const typoRate = options?.typoRate ?? 0.03;
  const actions: KeystrokeAction[] = [];

  let prevKey: string | null = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isLetter = /^[a-zA-Z]$/.test(key);

    // Kiểm tra xem có sinh typo gõ nhầm phím không
    if (isLetter && Math.random() < typoRate && ADJACENT_KEYS[key.toLowerCase()]) {
      const candidates = ADJACENT_KEYS[key.toLowerCase()];
      const typoKey = candidates[Math.floor(Math.random() * candidates.length)];

      // 1. Gõ phím sai
      const flightBeforeTypo = calculateFlightTime(prevKey, typoKey);
      const typoDwell = Math.max(30, Math.round(randomGaussian(65, 12)));
      actions.push({ key: typoKey, type: "keydown", delayBeforeMs: flightBeforeTypo });
      actions.push({ key: typoKey, type: "keyup", delayBeforeMs: typoDwell });

      // 2. Dừng lại một chút khi người gõ nhận ra mình gõ sai (120ms - 250ms)
      const hesitationDelay = Math.round(randomGaussian(180, 30));

      // 3. Bấm Backspace để xóa
      const backspaceDwell = Math.max(35, Math.round(randomGaussian(70, 10)));
      actions.push({ key: "Backspace", type: "keydown", delayBeforeMs: hesitationDelay });
      actions.push({ key: "Backspace", type: "keyup", delayBeforeMs: backspaceDwell });

      prevKey = "Backspace";
    }

    // Gõ phím đúng
    const flightTime = calculateFlightTime(prevKey, key);
    const dwellTime = Math.max(35, Math.min(130, Math.round(randomGaussian(70, 15))));

    actions.push({
      key,
      type: "keydown",
      delayBeforeMs: flightTime,
    });

    actions.push({
      key,
      type: "keyup",
      delayBeforeMs: dwellTime,
    });

    // Thỉnh thoảng người gõ dừng lại một nhịp ở dấu cách hoặc dấu câu
    if (key === " " || key === "." || key === ",") {
      prevKey = null;
    } else {
      prevKey = key;
    }
  }

  return actions;
}
