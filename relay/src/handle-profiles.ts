/**
 * `GET /profiles` — liệt kê profile antidetect **trên máy này**.
 *
 * ## Vì sao đường này không cần vé
 *
 * Ba đường kia chở bí mật: ciphertext của nick, hoặc mật khẩu proxy đã giải mã. Đường này chở
 * tên và id profile — thứ hiện sẵn trong cửa sổ MultiZen của chính người đang hỏi. Bắt nó đi qua
 * một tấm vé là bắt máy chủ cấp phép cho một danh sách mà **nó không nhìn thấy và không sở hữu**.
 *
 * Lớp gác vẫn còn nguyên và vẫn là lớp gác thật: CORS chỉ trả lời cho `webOrigin` nung trong bản
 * build, y hệt `/health` — đường vốn cũng khai khóa công khai của máy mà không cần vé.
 *
 * ## Chưa cấu hình MultiZen thì nói THIẾU GÌ, không trả mảng rỗng
 *
 * Mảng rỗng nghĩa là "máy này chưa có profile nào" — một câu trả lời khác hẳn "chưa nối được
 * MultiZen", và nó dẫn người đọc đi tạo profile mới trong khi kho của họ đang đầy.
 */
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { AntidetectNotConfiguredError, type RelayAntidetect } from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";

export async function handleProfilesRequest(
  antidetect: RelayAntidetect,
): Promise<RelayResponseBody> {
  let adapter;
  try {
    adapter = antidetect.getAdapter();
  } catch (error) {
    if (error instanceof AntidetectNotConfiguredError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  try {
    // Hai thứ trong một lượt gọi: giao diện tạo/chọn profile luôn cần cả danh sách lẫn danh mục,
    // và tách đôi chỉ để "sạch khái niệm" thì đổi lấy một vòng gọi nữa cho mỗi lần mở trang.
    const [profiles, fingerprintOptions] = await Promise.all([
      adapter.listProfiles(),
      adapter.fingerprintOptions(),
    ]);

    return {
      ok: true,
      profiles,
      fingerprintOptions,
      message:
        profiles.length === 0
          ? "MultiZen nối được nhưng chưa có profile nào trên máy này."
          : `${profiles.length} profile trên máy này.`,
    };
  } catch (error) {
    // Hỏi được adapter mà nó không trả lời rất hay là triệu chứng MultiZen vừa tắt — quên kết
    // quả dò đã nhớ để `/health` lần sau nói đúng hiện trạng thay vì tin cũ.
    antidetect.forgetProbe();
    return {
      ok: false,
      message: `Không đọc được danh sách profile. ${
        error instanceof AntidetectError ? error.message : String(error)
      }`,
    };
  }
}
