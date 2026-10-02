import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư | DeliverTrust",
  description:
    "Thông tin về dữ liệu được xử lý khi sử dụng hệ thống DeliverTrust.",
};

const sections: LegalSection[] = [
  {
    id: "gioi-thieu",
    title: "Giới thiệu",
    paragraphs: [
      "Chính sách này mô tả các nhóm thông tin DeliverTrust xử lý trong quá trình hỗ trợ quản lý tài khoản và quy trình giao nhận. Nội dung được xây dựng theo chức năng hiện có của dự án; đơn vị kiểm soát/vận hành, đầu mối tiếp nhận yêu cầu và thời hạn lưu trữ cụ thể cần được xác nhận trước khi áp dụng chính thức.",
      "DeliverTrust đang được phát triển trong khuôn khổ khóa luận tốt nghiệp. Chính sách này không phải tuyên bố chứng nhận tuân thủ pháp luật hoặc cam kết về biện pháp kỹ thuật chưa được triển khai.",
    ],
  },
  {
    id: "pham-vi",
    title: "Phạm vi áp dụng",
    paragraphs: [
      "Chính sách áp dụng cho người có tài khoản và người gửi, người nhận hoặc khách vãng lai có thông tin được nhập vào hệ thống; bao gồm việc truy cập trang web, sử dụng API và các chức năng giao nhận được triển khai trong môi trường tương ứng.",
    ],
  },
  {
    id: "loai-thong-tin",
    title: "Các loại thông tin được thu thập",
    paragraphs: [
      "Tùy thao tác và vai trò, hệ thống có thể xử lý các nhóm thông tin sau:",
    ],
    items: [
      "Tài khoản và hồ sơ: họ tên, email, số điện thoại, ảnh đại diện (nếu có), vai trò, trạng thái tài khoản, thời điểm tạo/cập nhật và lần đăng nhập gần nhất.",
      "Thông tin giao nhận: tên, số điện thoại, email, địa chỉ gửi/nhận, thông tin liên hệ, nội dung đơn hàng, loại dịch vụ, phí/COD và dữ liệu cần cho điều phối, kho, bàn giao hoặc tra cứu.",
      "Dữ liệu nghiệp vụ: mã vận đơn, trạng thái và thời điểm các mốc giao nhận, người/ vai trò thực hiện, ghi chú, ảnh chứng minh hoặc phản hồi nếu chức năng đó được sử dụng.",
      "Thông tin xác thực: mật khẩu được lưu dưới dạng hash trong bảng ứng dụng; OTP được gửi/xác minh qua Supabase Auth; JWT được dùng cho API, còn hash refresh token được lưu ở server. Không gửi mật khẩu hay OTP trong nội dung chính sách hoặc log ứng dụng.",
      "Dữ liệu kỹ thuật của yêu cầu: địa chỉ IP có thể được dùng dưới dạng HMAC để áp dụng giới hạn tần suất; hạ tầng lưu trữ hoặc dịch vụ bên thứ ba có thể xử lý metadata kết nối theo cấu hình của họ.",
    ],
  },
  {
    id: "muc-dich",
    title: "Mục đích sử dụng thông tin",
    paragraphs: [
      "Thông tin được dùng để tạo và quản lý tài khoản; xác thực, phân quyền và bảo vệ API; tạo, điều phối, giao và tra cứu đơn hàng; quản lý kho, COD, bàn giao, thông báo và phản hồi; hỗ trợ đối chiếu lịch sử trạng thái; áp dụng giới hạn tần suất; khắc phục sự cố và vận hành các chức năng người dùng yêu cầu.",
      "Thông tin không được mô tả ở đây như dữ liệu dùng cho quảng cáo hoặc bán danh sách dữ liệu. Mọi mục đích bổ sung cần được đơn vị vận hành xác định, thông báo và xử lý theo yêu cầu áp dụng.",
    ],
  },
  {
    id: "luu-tru-bao-ve",
    title: "Lưu trữ và bảo vệ thông tin",
    paragraphs: [
      "Dữ liệu nghiệp vụ của ứng dụng được lưu trong PostgreSQL qua Supabase. Một số thao tác xác thực email sử dụng Supabase Auth. Cấu hình môi trường có thể lưu khóa bí mật ở phía server; khóa service role không dành cho frontend.",
      "Hệ thống hiện có các biện pháp ở mức triển khai như hash mật khẩu bằng bcrypt, lưu hash refresh token, kiểm tra JWT và phân quyền API. Các biện pháp này không loại bỏ hoàn toàn rủi ro mất an toàn. Người dùng cần bảo vệ thông tin đăng nhập; đơn vị vận hành cần rà soát cấu hình, quyền truy cập, sao lưu và giám sát theo môi trường thực tế.",
    ],
  },
  {
    id: "chia-se",
    title: "Chia sẻ và cung cấp thông tin",
    paragraphs: [
      "Thông tin có thể được hiển thị cho tài khoản được phân quyền để thực hiện nghiệp vụ giao nhận; được xử lý bởi Supabase/PostgreSQL và các nhà cung cấp hạ tầng được cấu hình; hoặc được cung cấp khi có yêu cầu hợp lệ theo quy định áp dụng. Phạm vi truy cập phụ thuộc vào quyền, cấu hình và dữ liệu của từng chức năng.",
      "Không thể xác định từ mã nguồn một danh sách đầy đủ về nhà cung cấp, khu vực lưu trữ, thời hạn xử lý hoặc mọi bên nhận dữ liệu ở môi trường triển khai. Đơn vị vận hành cần bổ sung thông tin nhà cung cấp và cơ chế chuyển giao thực tế trước khi ban hành chính sách chính thức.",
    ],
  },
  {
    id: "quyen-nguoi-dung",
    title: "Quyền của người dùng",
    paragraphs: [
      "Người dùng có thể gửi yêu cầu xem, sửa hoặc làm rõ thông tin liên quan đến mình; yêu cầu hỗ trợ về tài khoản; hoặc nêu yêu cầu hạn chế/xóa dữ liệu khi có căn cứ. Việc xử lý yêu cầu phụ thuộc vào khả năng xác minh người yêu cầu, dữ liệu nghiệp vụ còn cần thiết và quy định áp dụng.",
      "Gửi yêu cầu tới [CẦN CẤU HÌNH: email/đầu mối tiếp nhận yêu cầu quyền riêng tư]. Hệ thống hiện không tuyên bố có cổng tự phục vụ cho tất cả quyền này; không phải mọi dữ liệu có thể xóa hoặc sửa, đặc biệt với bản ghi cần lưu để duy trì lịch sử nghiệp vụ hoặc đã ghi lên blockchain.",
    ],
  },
  {
    id: "thoi-han-luu-tru",
    title: "Thời hạn lưu trữ dữ liệu",
    paragraphs: [
      "Mã nguồn xác định cấu trúc và một số hạn dùng token, nhưng chưa xác định đầy đủ thời hạn lưu giữ cho hồ sơ, đơn hàng, nhật ký, phản hồi, bản sao lưu và dữ liệu của nhà cung cấp. Thời hạn lưu trữ: [CẦN CẤU HÌNH: lịch lưu trữ và tiêu chí xóa/ẩn danh theo từng nhóm dữ liệu].",
      "Đơn vị vận hành cần xác định lịch lưu giữ theo mục đích và nghĩa vụ áp dụng. Việc xóa tài khoản không nhất thiết đồng nghĩa với xóa các bản ghi liên quan đến đơn hàng hoặc dữ liệu bất biến trên blockchain.",
    ],
  },
  {
    id: "qr-blockchain",
    title: "Mã QR và dữ liệu trên Blockchain",
    paragraphs: [
      "Mã QR có thể chứa hoặc dẫn tới mã vận đơn/trang tra cứu; người có mã hoặc liên kết phù hợp có thể tiếp cận một phần thông tin tra cứu theo thiết kế của chức năng. Người dùng không nên chia sẻ mã QR hoặc mã vận đơn công khai nếu nội dung có thể liên kết tới giao dịch của mình.",
      "Theo thiết kế hợp đồng hiện tại, dữ liệu chi tiết sự kiện được lưu ngoài chuỗi trong cơ sở dữ liệu. Khi ghi blockchain được bật và giao dịch thành công, hợp đồng lưu mã vận đơn, loại sự kiện, địa chỉ đại diện người thực hiện, mã băm dữ liệu sự kiện và thời điểm block. Mã băm không phải dữ liệu cá nhân thô, nhưng tracking code và địa chỉ đại diện có thể có khả năng liên kết với dữ liệu khác.",
      "Blockchain hỗ trợ phát hiện thay đổi khi đối chiếu mã băm; không tự xác minh sự kiện giao nhận có thật hay không. Dữ liệu đã xác nhận trên blockchain thường không thể sửa/xóa theo cách cập nhật bản ghi cơ sở dữ liệu. Không đưa thông tin định danh trực tiếp vào payload công khai; việc bật ghi blockchain phụ thuộc cấu hình và không áp dụng mặc nhiên cho mọi sự kiện.",
    ],
  },
  {
    id: "cookie-ky-thuat",
    title: "Cookie và dữ liệu kỹ thuật",
    paragraphs: [
      "Mã nguồn ứng dụng hiện lưu token truy cập và thông tin người dùng trong localStorage hoặc sessionStorage tùy lựa chọn ghi nhớ đăng nhập; một số phiên tra cứu khách được giữ trong bộ nhớ trình duyệt. Không nên coi đây là cookie. Hạ tầng hosting, trình duyệt hoặc nhà cung cấp có thể xử lý cookie kỹ thuật hoặc nhật ký kết nối tùy cấu hình thực tế; chi tiết cần được đơn vị vận hành xác nhận trước khi công bố.",
    ],
  },
  {
    id: "tre-em",
    title: "Quyền riêng tư của trẻ em",
    paragraphs: [
      "DeliverTrust không được thiết kế riêng cho trẻ em. Người chưa đủ tuổi tự chịu trách nhiệm theo quy định áp dụng nên có sự hỗ trợ của cha mẹ hoặc người giám hộ khi cần cung cấp thông tin. Nếu phát hiện thông tin được gửi không phù hợp, vui lòng liên hệ đầu mối quyền riêng tư để được xem xét.",
    ],
  },
  {
    id: "thay-doi",
    title: "Thay đổi chính sách",
    paragraphs: [
      "Chính sách có thể được cập nhật khi chức năng, nhà cung cấp hoặc cách xử lý dữ liệu thay đổi. Phiên bản mới và ngày hiệu lực sẽ được đăng tại trang này sau khi đơn vị vận hành rà soát. Người dùng nên kiểm tra định kỳ hoặc khi nhận thông báo thay đổi.",
    ],
  },
  {
    id: "lien-he",
    title: "Thông tin liên hệ và yêu cầu về quyền riêng tư",
    paragraphs: [
      "Đơn vị vận hành/đầu mối xử lý dữ liệu: [CẦN CẤU HÌNH: tên tổ chức/cá nhân].",
      "Email tiếp nhận yêu cầu quyền riêng tư: [CẦN CẤU HÌNH: địa chỉ email].",
      "Địa chỉ liên hệ (nếu áp dụng): [CẦN CẤU HÌNH: địa chỉ liên hệ].",
      "Khi gửi yêu cầu, chỉ cung cấp thông tin cần thiết để xác minh và xử lý; không gửi mật khẩu, OTP hoặc token.",
    ],
  },
  {
    id: "hieu-luc",
    title: "Hiệu lực",
    paragraphs: [
      "Ngày hiệu lực: 10/10/2026. Phiên bản này cần được đơn vị vận hành xác nhận và điền các thông tin liên hệ, nhà cung cấp và lịch lưu trữ trước khi được xem là chính sách chính thức.",
    ],
  },
];

export default function PrivacyPage(): React.JSX.Element {
  return (
    <LegalPage
      title="Chính sách quyền riêng tư"
      description="Chính sách này tóm tắt các loại dữ liệu DeliverTrust có thể xử lý theo mã nguồn và chức năng hiện có. Các thông tin triển khai chưa được xác nhận được đánh dấu rõ để đơn vị vận hành hoàn thiện."
      effectiveDate="10/10/2026"
      sections={sections}
    />
  );
}
