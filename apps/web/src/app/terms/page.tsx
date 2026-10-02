import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng | DeliverTrust",
  description:
    "Điều khoản sử dụng hệ thống quản lý và xác thực quy trình giao nhận DeliverTrust.",
};

const sections: LegalSection[] = [
  {
    id: "gioi-thieu",
    title: "Giới thiệu",
    paragraphs: [
      "Điều khoản này mô tả các nguyên tắc sử dụng DeliverTrust, một hệ thống phần mềm hỗ trợ quản lý và tra cứu thông tin quy trình giao nhận hàng hóa. Khi tạo tài khoản hoặc tiếp tục sử dụng chức năng có liên quan, người dùng cần đọc và tuân thủ các điều khoản áp dụng.",
      "DeliverTrust hiện được phát triển trong khuôn khổ khóa luận tốt nghiệp. Tài liệu này là nội dung thông tin cho sản phẩm; đơn vị vận hành, ngày hiệu lực và đầu mối hỗ trợ chính thức cần được xác nhận trước khi áp dụng thực tế.",
    ],
  },
  {
    id: "pham-vi-dich-vu",
    title: "Phạm vi và chức năng dịch vụ DeliverTrust",
    paragraphs: [
      "Tùy theo vai trò và cấu hình triển khai, hệ thống hỗ trợ quản lý tài khoản, thông tin đơn hàng, kho và tuyến giao nhận; ghi nhận các mốc trạng thái; tra cứu hành trình; và hỗ trợ quản lý một số thông tin vận hành như COD, bàn giao, thông báo và phản hồi.",
      "Một số mốc sự kiện có thể được ghi nhận bằng mã băm và metadata trên blockchain khi chức năng ghi blockchain được cấu hình bật và giao dịch thành công. Khả năng sử dụng thực tế phụ thuộc vào cấu hình, kết nối mạng, dữ liệu do người dùng cung cấp và trạng thái các dịch vụ tích hợp.",
    ],
  },
  {
    id: "tai-khoan",
    title: "Đăng ký và quản lý tài khoản",
    paragraphs: [
      "Người đăng ký cần cung cấp thông tin chính xác, cập nhật thông tin hồ sơ khi cần và bảo vệ thông tin xác thực của mình. Đăng ký công khai hiện dành cho vai trò khách hàng; các vai trò vận hành được cấp và quản lý theo quy trình quản trị của hệ thống, không phải do người dùng tự chọn khi đăng ký.",
      "Email OTP, nếu được yêu cầu, dùng để xác minh quyền kiểm soát địa chỉ email tại thời điểm thao tác. Việc xác minh email không thay thế các kiểm tra tài khoản hoặc quyền truy cập khác.",
      "Mỗi người dùng chịu trách nhiệm với hoạt động phát sinh từ tài khoản và cần thông báo cho đầu mối hỗ trợ khi nghi ngờ thông tin xác thực bị lộ hoặc tài khoản bị sử dụng trái phép. Không chia sẻ mật khẩu, OTP hoặc token cho người khác.",
    ],
  },
  {
    id: "quy-dinh-su-dung",
    title: "Quy định sử dụng dịch vụ",
    paragraphs: [
      "Người dùng chỉ được sử dụng hệ thống cho mục đích hợp pháp và trong phạm vi quyền được cấp. Không được truy cập trái phép, giả mạo danh tính hoặc sự kiện, can thiệp dữ liệu, làm gián đoạn hệ thống, dò quét tài khoản hay sử dụng dữ liệu của người khác ngoài mục đích nghiệp vụ được phép.",
      "Thông tin về hàng hóa, địa chỉ, người gửi, người nhận, trạng thái và chứng từ cần được nhập trung thực, phù hợp với giao dịch thực tế. Không gửi hàng hóa bị cấm theo quy định áp dụng hoặc sử dụng DeliverTrust để thực hiện hành vi vi phạm.",
    ],
  },
  {
    id: "trach-nhiem-giao-nhan",
    title: "Trách nhiệm của các bên trong quy trình giao nhận",
    paragraphs: [
      "Người gửi chịu trách nhiệm về tính chính xác của thông tin đơn hàng, địa chỉ, liên hệ và nội dung khai báo; đóng gói phù hợp và tuân thủ quy định áp dụng đối với hàng hóa.",
      "Người nhận cần phối hợp nhận hàng, kiểm tra thông tin phù hợp và phản hồi qua các chức năng hiện có khi cần. Nhân viên giao nhận, điều phối và kho chỉ thực hiện thao tác trong phạm vi vai trò được cấp, đồng thời ghi nhận trạng thái theo quy trình vận hành.",
      "DeliverTrust lưu và hiển thị dữ liệu nghiệp vụ do các bên hoặc hệ thống tích hợp ghi nhận; bản thân nền tảng không thể xác nhận độc lập rằng một sự kiện giao nhận đã thực sự xảy ra ngoài thực tế.",
    ],
  },
  {
    id: "qr-blockchain",
    title: "Mã QR và xác thực Blockchain",
    paragraphs: [
      "Mã QR có thể giúp mở nhanh trang hoặc thông tin tra cứu tương ứng. Người dùng cần kiểm tra mã vận đơn và nội dung hiển thị, không xem việc quét QR là bằng chứng duy nhất về danh tính người giao, người nhận hoặc tính xác thực của hàng hóa.",
      "Blockchain hỗ trợ đối chiếu tính toàn vẹn của dữ liệu sự kiện thông qua mã băm và metadata được ghi nhận. Blockchain không tự kiểm tra tính đúng sai của dữ liệu đầu vào và không chứng minh sự kiện đã xảy ra ngoài đời. Thông tin chi tiết đơn hàng được quản lý ngoài chuỗi; không nên ghi dữ liệu cá nhân hoặc bí mật vào trường công khai.",
      "Giao dịch blockchain phụ thuộc vào cấu hình triển khai và có thể chậm, thất bại hoặc không được bật. Không phải mọi thao tác hoặc mọi bản ghi trong hệ thống đều mặc nhiên đã được ghi lên blockchain.",
    ],
  },
  {
    id: "don-vi-van-hanh",
    title: "Quyền và nghĩa vụ của đơn vị vận hành",
    paragraphs: [
      "Đơn vị vận hành dự kiến là [CẦN CẤU HÌNH: tên tổ chức/cá nhân vận hành]. Trong phạm vi hệ thống và quyền quản trị được thiết lập, đơn vị vận hành có thể quản lý tài khoản, phân quyền, cấu hình dịch vụ, bảo trì và xử lý sự cố kỹ thuật.",
      "Đơn vị vận hành cần quản lý quyền truy cập phù hợp, thông báo những thay đổi quan trọng khi có thể và tiếp nhận yêu cầu qua đầu mối hỗ trợ được công bố. Nội dung này không khẳng định trước rằng đã có một quy trình hỗ trợ, SLA hoặc biện pháp bảo đảm cụ thể nào ngoài cấu hình thực tế.",
    ],
  },
  {
    id: "gioi-han-trach-nhiem",
    title: "Giới hạn trách nhiệm",
    paragraphs: [
      "Thông tin trạng thái và báo cáo trong hệ thống phụ thuộc vào dữ liệu đầu vào, thao tác của các bên, kết nối dịch vụ và cấu hình môi trường. Người dùng cần đối chiếu với chứng từ hoặc nguồn nghiệp vụ thích hợp khi cần quyết định quan trọng.",
      "Trong phạm vi pháp luật cho phép, DeliverTrust là công cụ hỗ trợ quản lý và xác minh dữ liệu, không thay thế hợp đồng vận chuyển, chứng từ giao nhận, quy trình giải quyết khiếu nại hoặc nghĩa vụ của các bên trong giao dịch. Điều khoản này không loại trừ trách nhiệm mà pháp luật không cho phép loại trừ.",
    ],
  },
  {
    id: "tam-ngung-cham-dut",
    title: "Tạm ngừng và chấm dứt sử dụng",
    paragraphs: [
      "Người dùng có thể ngừng sử dụng dịch vụ và gửi yêu cầu về tài khoản tới [CẦN CẤU HÌNH: email/đầu mối hỗ trợ]. Đơn vị vận hành có thể tạm ngừng quyền truy cập trong phạm vi cần thiết để bảo trì, xử lý sự cố, bảo vệ hệ thống hoặc phản hồi hành vi có dấu hiệu vi phạm; khi phù hợp, sẽ thông báo lý do và cách liên hệ.",
      "Việc chấm dứt quyền truy cập không mặc nhiên xóa các bản ghi nghiệp vụ, nghĩa vụ đang xử lý hoặc dữ liệu đã được ghi lên blockchain. Yêu cầu xử lý dữ liệu được tiếp nhận theo chính sách quyền riêng tư và quy định áp dụng.",
    ],
  },
  {
    id: "thay-doi-dieu-khoan",
    title: "Thay đổi điều khoản",
    paragraphs: [
      "Điều khoản có thể được cập nhật khi phạm vi dịch vụ, cấu hình hoặc yêu cầu áp dụng thay đổi. Phiên bản mới sẽ được đăng trên trang này kèm ngày hiệu lực đã được cấu hình. Người dùng nên xem lại nội dung khi tiếp tục sử dụng sau khi có thông báo thay đổi.",
    ],
  },
  {
    id: "luat-tranh-chap",
    title: "Luật áp dụng và giải quyết tranh chấp",
    paragraphs: [
      "Luật áp dụng: [CẦN XÁC NHẬN: luật áp dụng]. Các bên nên ưu tiên liên hệ đầu mối hỗ trợ để làm rõ và trao đổi thiện chí trước khi sử dụng phương thức giải quyết tranh chấp phù hợp theo quy định áp dụng. Không nội dung nào tại đây xác định trước thẩm quyền hoặc kết quả giải quyết tranh chấp.",
    ],
  },
  {
    id: "lien-he",
    title: "Thông tin liên hệ",
    paragraphs: [
      "Đơn vị vận hành: [CẦN CẤU HÌNH: tên đơn vị vận hành].",
      "Email hỗ trợ: [CẦN CẤU HÌNH: địa chỉ email hỗ trợ].",
      "Địa chỉ liên hệ (nếu áp dụng): [CẦN CẤU HÌNH: địa chỉ liên hệ].",
    ],
  },
];

export default function TermsPage(): React.JSX.Element {
  return (
    <LegalPage
      title="Điều khoản sử dụng dịch vụ"
      description="Vui lòng đọc các nguyên tắc sử dụng DeliverTrust. Nội dung cần được đơn vị vận hành rà soát và hoàn tất các thông tin chờ cấu hình trước khi công bố áp dụng chính thức."
      effectiveDate="[CẦN CẤU HÌNH: ngày hiệu lực]"
      sections={sections}
    />
  );
}
