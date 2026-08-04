/**
 * Ai đang gọi — và họ có được phép không.
 *
 * ## Vì sao vai trò tính lại ở MỖI request thay vì đọc cột `User.role`
 *
 * Nguồn sự thật của "ai được vào" và "ai là admin" là biến môi trường, không phải database
 * (xem `allowed-emails.ts`). Cột `User.role` chỉ là bản sao ghi lúc tạo tài khoản.
 *
 * Nếu tin cột đó thì gỡ một người khỏi `ALLOWED_EMAILS` sẽ **không đuổi được họ**: hàng `User`
 * vẫn còn, phiên vẫn còn hạn, và họ vẫn mở được kho danh tính cho tới khi ai đó nhớ ra phải
 * xóa hàng trong database. Tính lại từ biến môi trường thì sửa biến + khởi động lại là mất
 * quyền ngay, kể cả người đó đang mở sẵn tab.
 *
 * Đây là thứ cần đúng vào ngày có người rời team — ngày mà không ai muốn phải nhớ thêm một
 * bước thủ công nào.
 *
 * ## Vì sao ném lỗi thay vì trả về null
 *
 * Trả `null` thì chỗ gọi phải nhớ kiểm, và quên kiểm là **lọt** chứ không phải hỏng. Ném lỗi
 * thì quên xử lý là request đổ — hỏng ồn ào, đúng hướng an toàn.
 */
import { headers } from "next/headers";
import { prisma } from "../db/prisma-client";
import { isEmailAllowed, readEmailAccessList, roleForEmail } from "./allowed-emails";
import { getAuth } from "./auth-server";

/** Người đang thao tác, đã xác minh xong. */
export interface Actor {
  userId: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
}

/**
 * Lỗi "chưa đăng nhập / không có quyền".
 *
 * Có kiểu riêng để tầng trên phân biệt được với lỗi nghiệp vụ: chưa đăng nhập thì đẩy về
 * màn hình đăng nhập, còn thiếu quyền thì hiện thông báo. Gộp chung vào `Error` thì hai
 * tình huống rất khác nhau lại ra cùng một màn hình.
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    /** `true` = chưa đăng nhập; `false` = đã đăng nhập nhưng không đủ quyền. */
    readonly needsLogin: boolean,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Lấy người đang gọi, hoặc ném lỗi.
 *
 * Đây là **chốt chặn thật** của cả hệ thống đăng nhập — không phải cái hook lúc tạo tài khoản
 * trong `auth-server.ts`. Mọi server action và route handler đều đi qua đây.
 */
export async function requireActor(): Promise<Actor> {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    throw new AuthorizationError("Chưa đăng nhập.", true);
  }

  const { email, id } = session.user;

  // Kiểm lại danh sách trắng ở MỖI request. Phiên còn hạn không có nghĩa là người đó còn
  // thuộc team — xem chú thích đầu file.
  const list = readEmailAccessList();
  if (!isEmailAllowed(email, list)) {
    throw new AuthorizationError(
      `Tài khoản ${email} không còn quyền dùng công cụ này.`,
      // Đăng nhập lại cũng vô ích, nên đừng đẩy về màn hình đăng nhập rồi để họ quay vòng.
      false,
    );
  }

  return { userId: id, email, role: roleForEmail(email, list) };
}

/** Như `requireActor` nhưng bắt buộc vai trò ADMIN. */
export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor();

  if (actor.role !== "ADMIN") {
    throw new AuthorizationError("Việc này chỉ quản trị viên làm được.", false);
  }

  return actor;
}

/**
 * Chặn đường lấy BÍ MẬT của một nick: chỉ chủ nick hoặc ADMIN.
 *
 * Gọi bên trong thân hàm chứ không bọc ngoài như `guardedAction`, vì nó cần biết
 * `accountId` — thứ chỉ có sau khi đã đọc tham số. Bọc ngoài thì phải quy ước "tham số đầu
 * tiên luôn là accountId", một quy ước ngầm mà người viết action sau này không có cách nào
 * biết là mình đang vi phạm.
 *
 * **Chỉ áp cho bí mật, không áp cho tầm nhìn.** Ai cũng phải thấy được nick, job và lịch sử
 * của người khác: luật đụng độ thread nêu đúng tên nick của đồng nghiệp thì người đọc mới
 * xử lý được. Chia tầm nhìn là làm bộ luật mù.
 */
export async function requireNickOwner(actor: Actor, accountId: string): Promise<void> {
  if (actor.role === "ADMIN") return;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { ownerId: true, username: true },
  });

  if (!account) {
    throw new AuthorizationError("Không tìm thấy nick này.", false);
  }

  // Nick chưa phân công thì chỉ ADMIN lấy được bí mật — đã trả về ở trên. Tới đây nghĩa là
  // OPERATOR đang hỏi một nick không có chủ: từ chối. Mặc định đóng, không mặc định mở.
  if (account.ownerId === null) {
    throw new AuthorizationError(
      `Nick "${account.username}" chưa được phân công cho ai. Nhờ quản trị viên gán chủ trước.`,
      false,
    );
  }

  if (account.ownerId !== actor.userId) {
    throw new AuthorizationError(
      `Nick "${account.username}" do người khác phụ trách — chỉ chủ nick lấy được mật khẩu và OTP của nó.`,
      false,
    );
  }
}
