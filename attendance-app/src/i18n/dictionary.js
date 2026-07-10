// 모바일 근로자 화면의 다국어 지원 사전. 관리자(PC)쪽은 한국인 담당자가
// 쓰는 것을 전제로 번역 대상에서 제외했다. 키 하나당 지원 언어 전체의
// 번역을 한 곳에 모아두는 구조라, 새 문구를 추가할 때 STRINGS에 항목
// 하나만 넣으면 된다 — 언어를 하나 더 추가하려면 SUPPORTED_LANGUAGES에
// 코드를 넣고, 아래 STRINGS의 각 항목에 그 언어 키만 채워 넣으면 된다
// (없는 언어는 자동으로 한국어 원문으로 대체된다).
export const SUPPORTED_LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "中文" },
  { code: "th", label: "ภาษาไทย" },
];

const STRINGS = {
  // 하단 탭 / 공용
  "nav.workInfo": { ko: "근무정보", en: "Work Info", vi: "Thông tin làm việc", zh: "工作信息", th: "ข้อมูลการทำงาน" },
  "nav.history": { ko: "출근현황", en: "Attendance", vi: "Chấm công", zh: "考勤", th: "การเข้างาน" },
  "nav.check": { ko: "체크", en: "Check", vi: "Điểm danh", zh: "打卡", th: "เช็คอิน" },
  "nav.board": { ko: "공지사항", en: "Notices", vi: "Thông báo", zh: "公告", th: "ประกาศ" },
  "nav.myInfo": { ko: "내정보", en: "My Info", vi: "Thông tin của tôi", zh: "我的信息", th: "ข้อมูลของฉัน" },
  "common.save": { ko: "저장", en: "Save", vi: "Lưu", zh: "保存", th: "บันทึก" },
  "common.saving": { ko: "저장 중...", en: "Saving...", vi: "Đang lưu...", zh: "保存中...", th: "กำลังบันทึก..." },
  "common.cancel": { ko: "취소", en: "Cancel", vi: "Hủy", zh: "取消", th: "ยกเลิก" },
  "common.confirm": { ko: "확인", en: "Confirm", vi: "Xác nhận", zh: "确认", th: "ยืนยัน" },
  "common.close": { ko: "닫기", en: "Close", vi: "Đóng", zh: "关闭", th: "ปิด" },
  "common.select": { ko: "선택", en: "Select", vi: "Chọn", zh: "选择", th: "เลือก" },
  "common.none": { ko: "없음", en: "None", vi: "Không có", zh: "无", th: "ไม่มี" },
  "common.requesting": { ko: "요청 중...", en: "Requesting...", vi: "Đang gửi yêu cầu...", zh: "请求中...", th: "กำลังส่งคำขอ..." },
  "common.send": { ko: "요청 보내기", en: "Send Request", vi: "Gửi yêu cầu", zh: "发送请求", th: "ส่งคำขอ" },

  // EmployeeLayout
  "layout.greeting": { ko: "안녕하세요", en: "Hello", vi: "Xin chào", zh: "您好", th: "สวัสดี" },
  "layout.nameSuffix": { ko: "{{name}}님", en: "{{name}}", vi: "{{name}}", zh: "{{name}}", th: "คุณ{{name}}" },
  "onboarding.title": {
    ko: "완료해야 할 항목이 있습니다",
    en: "You have items to complete",
    vi: "Bạn có mục cần hoàn thành",
    zh: "您有待完成的项目",
    th: "คุณมีรายการที่ต้องทำให้เสร็จ",
  },
  "onboarding.body": {
    ko: "아래 항목을 먼저 완료해주세요. 완료 전에는 출근 처리가 되지 않습니다.",
    en: "Please complete the items below first. Check-in isn't available until they're done.",
    vi: "Vui lòng hoàn thành các mục bên dưới trước. Bạn không thể chấm công cho đến khi hoàn tất.",
    zh: "请先完成以下项目。完成之前无法进行打卡。",
    th: "โปรดทำรายการด้านล่างให้เสร็จก่อน จะเช็คอินไม่ได้จนกว่าจะทำเสร็จ",
  },
  "onboarding.later": { ko: "나중에 하기", en: "Later", vi: "Để sau", zh: "稍后再说", th: "ทำภายหลัง" },
  "onboarding.signContract": {
    ko: "근로계약서 서명하기",
    en: "Sign employment contract",
    vi: "Ký hợp đồng lao động",
    zh: "签署劳动合同",
    th: "ลงนามสัญญาจ้างงาน",
  },
  "onboarding.completeSafety": {
    ko: "안전교육 이수하기 ({{count}}건)",
    en: "Complete safety training ({{count}})",
    vi: "Hoàn thành đào tạo an toàn ({{count}})",
    zh: "完成安全教育（{{count}}项）",
    th: "ทำการอบรมความปลอดภัยให้เสร็จ ({{count}})",
  },

  // MyInfoPage
  "myInfo.language": { ko: "언어 설정", en: "Language", vi: "Ngôn ngữ", zh: "语言设置", th: "ตั้งค่าภาษา" },
  "myInfo.push": { ko: "푸시 알림 받기", en: "Push Notifications", vi: "Nhận thông báo đẩy", zh: "接收推送通知", th: "รับการแจ้งเตือน" },
  "myInfo.pushOn": { ko: "푸시 알림이 켜졌습니다", en: "Push notifications turned on", vi: "Đã bật thông báo đẩy", zh: "推送通知已开启", th: "เปิดการแจ้งเตือนแล้ว" },
  "myInfo.pushOff": { ko: "푸시 알림을 껐습니다", en: "Push notifications turned off", vi: "Đã tắt thông báo đẩy", zh: "推送通知已关闭", th: "ปิดการแจ้งเตือนแล้ว" },
  "myInfo.pushDenied": {
    ko: "알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.",
    en: "Notification permission denied. Please allow it in your browser settings.",
    vi: "Quyền thông báo đã bị từ chối. Vui lòng cho phép trong cài đặt trình duyệt.",
    zh: "通知权限已被拒绝。请在浏览器设置中允许。",
    th: "การอนุญาตแจ้งเตือนถูกปฏิเสธ โปรดอนุญาตในการตั้งค่าเบราว์เซอร์",
  },
  "myInfo.basicInfo": { ko: "기본정보 입력", en: "Basic Info", vi: "Thông tin cơ bản", zh: "基本信息", th: "ข้อมูลพื้นฐาน" },
  "myInfo.locked": { ko: "수정 잠김", en: "Locked", vi: "Đã khóa", zh: "已锁定", th: "ล็อกแล้ว" },
  "myInfo.lockedDesc": {
    ko: "최초 저장 후에는 직접 수정할 수 없습니다. 정보가 변경되었다면 아래 수정요청 버튼으로 관리자에게 요청해주세요.",
    en: "You can't edit this directly after the first save. If your info changed, use the request button below to ask the admin.",
    vi: "Bạn không thể tự chỉnh sửa sau lần lưu đầu tiên. Nếu thông tin thay đổi, hãy dùng nút yêu cầu bên dưới để gửi cho quản trị viên.",
    zh: "首次保存后无法自行修改。如信息有变动，请使用下方的修改申请按钮联系管理员。",
    th: "หลังบันทึกครั้งแรกจะแก้ไขเองไม่ได้ หากข้อมูลเปลี่ยนแปลง โปรดใช้ปุ่มขอแก้ไขด้านล่างเพื่อแจ้งผู้ดูแล",
  },
  "myInfo.unlockedDesc": {
    ko: "급여 지급 및 서류 발급에 사용되는 정보입니다. 정확히 입력 후 저장해주세요. 최초 1회만 직접 저장할 수 있고, 이후에는 수정요청을 통해서만 변경됩니다.",
    en: "This info is used for payroll and document issuance. Please enter it accurately and save. You can only save it yourself once — after that, changes go through an edit request.",
    vi: "Thông tin này dùng để trả lương và cấp giấy tờ. Vui lòng nhập chính xác rồi lưu. Bạn chỉ có thể tự lưu một lần, sau đó cần gửi yêu cầu chỉnh sửa.",
    zh: "此信息用于发放工资和出具文件，请准确填写后保存。仅可自行保存一次，之后需通过修改申请变更。",
    th: "ข้อมูลนี้ใช้สำหรับจ่ายเงินเดือนและออกเอกสาร โปรดกรอกให้ถูกต้องแล้วบันทึก คุณบันทึกเองได้เพียงครั้งเดียว หลังจากนั้นต้องขอแก้ไข",
  },
  "myInfo.id": { ko: "ID", en: "ID", vi: "ID", zh: "ID", th: "ไอดี" },
  "myInfo.residentNumber": { ko: "주민/외국인번호", en: "Resident/Foreigner No.", vi: "Số CMND/Đăng ký người nước ngoài", zh: "身份证/外国人登记号", th: "เลขบัตรประชาชน/คนต่างชาติ" },
  "myInfo.residentNumberPlaceholder": { ko: "주민등록번호 또는 외국인등록번호", en: "Resident or foreigner registration number", vi: "Số CMND hoặc số đăng ký người nước ngoài", zh: "身份证号或外国人登记号", th: "เลขบัตรประชาชนหรือเลขทะเบียนคนต่างชาติ" },
  "myInfo.address": { ko: "주소", en: "Address", vi: "Địa chỉ", zh: "地址", th: "ที่อยู่" },
  "myInfo.addressPlaceholder": { ko: "눌러서 주소 검색", en: "Tap to search address", vi: "Nhấn để tìm địa chỉ", zh: "点击搜索地址", th: "แตะเพื่อค้นหาที่อยู่" },
  "myInfo.addressDetail": { ko: "상세주소", en: "Address Detail", vi: "Địa chỉ chi tiết", zh: "详细地址", th: "ที่อยู่โดยละเอียด" },
  "myInfo.addressDetailPlaceholder": { ko: "동/호수 등 나머지 주소", en: "Unit/apartment number, etc.", vi: "Số nhà/căn hộ, v.v.", zh: "楼栋/门牌号等", th: "บ้านเลขที่/ห้อง เป็นต้น" },
  "myInfo.bankName": { ko: "급여은행", en: "Bank", vi: "Ngân hàng", zh: "工资开户行", th: "ธนาคาร" },
  "myInfo.bankAccount": { ko: "급여계좌", en: "Account Number", vi: "Số tài khoản", zh: "工资账户", th: "เลขบัญชี" },
  "myInfo.accountHolder": { ko: "예금주", en: "Account Holder", vi: "Chủ tài khoản", zh: "账户持有人", th: "ชื่อเจ้าของบัญชี" },
  "myInfo.requestPending": { ko: "수정요청 처리 대기중입니다", en: "Edit request is pending review", vi: "Yêu cầu chỉnh sửa đang chờ xử lý", zh: "修改申请正在等待处理", th: "คำขอแก้ไขกำลังรอดำเนินการ" },
  "myInfo.requestEdit": { ko: "수정요청", en: "Request Edit", vi: "Yêu cầu chỉnh sửa", zh: "申请修改", th: "ขอแก้ไข" },
  "myInfo.requestModalTitle": { ko: "기본정보 수정요청", en: "Edit Basic Info", vi: "Yêu cầu chỉnh sửa thông tin", zh: "申请修改基本信息", th: "ขอแก้ไขข้อมูลพื้นฐาน" },
  "myInfo.requestModalDesc": {
    ko: "수정하고 싶은 값으로 바꾼 뒤 요청을 보내면, 관리자가 확인 후 반영 여부를 결정합니다.",
    en: "Change to the new value and send the request — the admin will review and decide whether to apply it.",
    vi: "Thay đổi thành giá trị mong muốn rồi gửi yêu cầu, quản trị viên sẽ xem xét và quyết định áp dụng.",
    zh: "修改为想要的值后发送申请，管理员确认后决定是否采纳。",
    th: "เปลี่ยนเป็นค่าที่ต้องการแล้วส่งคำขอ ผู้ดูแลจะตรวจสอบและตัดสินใจว่าจะนำไปใช้หรือไม่",
  },
  "myInfo.requestReason": { ko: "수정 사유(선택)", en: "Reason (optional)", vi: "Lý do (không bắt buộc)", zh: "修改原因（选填）", th: "เหตุผล (ไม่บังคับ)" },
  "myInfo.documents": { ko: "서류함", en: "Documents", vi: "Hồ sơ", zh: "文件夹", th: "เอกสาร" },
  "myInfo.safety": { ko: "안전교육", en: "Safety Training", vi: "Đào tạo an toàn", zh: "安全教育", th: "การอบรมความปลอดภัย" },
  "myInfo.safetyArchive": { ko: "안전교육자료", en: "Safety Materials", vi: "Tài liệu an toàn", zh: "安全教育资料", th: "เอกสารความปลอดภัย" },
  "myInfo.lock": { ko: "잠금", en: "Lock", vi: "Khóa", zh: "锁定", th: "ล็อก" },
  "myInfo.logout": { ko: "로그아웃", en: "Log Out", vi: "Đăng xuất", zh: "退出登录", th: "ออกจากระบบ" },
  "myInfo.basicSaved": {
    ko: "저장되었습니다. 이후 수정이 필요하면 수정요청을 이용해주세요.",
    en: "Saved. If you need to change it later, please use the edit request.",
    vi: "Đã lưu. Nếu cần thay đổi sau này, vui lòng dùng yêu cầu chỉnh sửa.",
    zh: "已保存。如需修改，请使用修改申请功能。",
    th: "บันทึกแล้ว หากต้องแก้ไขภายหลัง โปรดใช้การขอแก้ไข",
  },
  "myInfo.requestSubmitted": {
    ko: "수정요청이 접수되었습니다. 관리자 확인 후 반영됩니다.",
    en: "Your edit request has been submitted. It will apply after admin review.",
    vi: "Yêu cầu chỉnh sửa đã được gửi. Sẽ được áp dụng sau khi quản trị viên xem xét.",
    zh: "修改申请已提交，管理员确认后将生效。",
    th: "ส่งคำขอแก้ไขแล้ว จะมีผลหลังผู้ดูแลตรวจสอบ",
  },

  // AttendanceHistory
  "attendance.title": { ko: "출근기록", en: "Attendance Record", vi: "Lịch sử chấm công", zh: "考勤记录", th: "ประวัติการเข้างาน" },
  "attendance.empty": { ko: "출근 기록이 없습니다.", en: "No attendance records yet.", vi: "Chưa có lịch sử chấm công.", zh: "暂无考勤记录。", th: "ยังไม่มีประวัติการเข้างาน" },
  "attendance.status.출근": { ko: "출근", en: "Present", vi: "Đi làm", zh: "出勤", th: "มาทำงาน" },
  "attendance.status.지각": { ko: "지각", en: "Late", vi: "Đi muộn", zh: "迟到", th: "มาสาย" },
  "attendance.status.결근": { ko: "결근", en: "Absent", vi: "Vắng mặt", zh: "缺勤", th: "ขาดงาน" },
  "attendance.status.조퇴": { ko: "조퇴", en: "Left Early", vi: "Về sớm", zh: "早退", th: "ออกก่อนเวลา" },
  "attendance.status.미출근": { ko: "미출근", en: "Not Checked In", vi: "Chưa chấm công", zh: "未出勤", th: "ยังไม่เข้างาน" },
  "attendance.checkInTime": { ko: "출근시각", en: "Check-in Time", vi: "Giờ vào", zh: "上班时间", th: "เวลาเข้างาน" },
  "attendance.checkOutTime": { ko: "퇴근시각", en: "Check-out Time", vi: "Giờ ra", zh: "下班时间", th: "เวลาออกงาน" },
  "attendance.detailTitle": { ko: "출근기록 상세", en: "Attendance Details", vi: "Chi tiết chấm công", zh: "考勤详情", th: "รายละเอียดการเข้างาน" },
  "attendance.requestPending": { ko: "승인대기", en: "Pending", vi: "Đang chờ duyệt", zh: "待审批", th: "รอการอนุมัติ" },
  "attendance.requestApproved": { ko: "승인됨", en: "Approved", vi: "Đã duyệt", zh: "已批准", th: "อนุมัติแล้ว" },
  "attendance.requestRejected": { ko: "반려됨", en: "Rejected", vi: "Bị từ chối", zh: "已驳回", th: "ถูกปฏิเสธ" },
  "attendance.requestedTime": { ko: "{{status}} 시각 {{time}}", en: "{{status}} time {{time}}", vi: "Giờ {{status}} {{time}}", zh: "{{status}}时间 {{time}}", th: "เวลา{{status}} {{time}}" },
  "attendance.waitingApproval": { ko: "승인 대기중", en: "Awaiting Approval", vi: "Đang chờ duyệt", zh: "等待批准中", th: "รอการอนุมัติ" },
  "attendance.requestChange": { ko: "시각 변경 요청", en: "Request Time Change", vi: "Yêu cầu đổi giờ", zh: "申请更改时间", th: "ขอเปลี่ยนเวลา" },
  "attendance.requestReasonPlaceholder": { ko: "변경 사유를 입력해주세요", en: "Please enter the reason", vi: "Vui lòng nhập lý do", zh: "请输入变更原因", th: "โปรดระบุเหตุผล" },
  "attendance.submitRequest": { ko: "요청 제출", en: "Submit", vi: "Gửi yêu cầu", zh: "提交申请", th: "ส่งคำขอ" },
  "attendance.loadError": {
    ko: "출근기록을 불러오지 못했습니다. 앱을 다시 시작해주세요.",
    en: "Failed to load attendance records. Please restart the app.",
    vi: "Không thể tải lịch sử chấm công. Vui lòng khởi động lại ứng dụng.",
    zh: "无法加载考勤记录，请重新启动应用。",
    th: "โหลดประวัติการเข้างานไม่สำเร็จ โปรดเริ่มแอปใหม่",
  },
  "attendance.requestSubmitted": {
    ko: "변경 요청이 접수되었습니다. 관리자 승인을 기다려주세요.",
    en: "Change request submitted. Please wait for admin approval.",
    vi: "Yêu cầu thay đổi đã được gửi. Vui lòng chờ quản trị viên duyệt.",
    zh: "变更申请已提交，请等待管理员批准。",
    th: "ส่งคำขอเปลี่ยนแปลงแล้ว โปรดรอการอนุมัติจากผู้ดูแล",
  },
  "attendance.requestNotice": {
    ko: "변경 요청을 제출하면 관리자 승인 후 실제 기록에 반영됩니다. 승인 대기 중인 요청이 있으면 새 요청을 제출할 수 없습니다.",
    en: "Once submitted, the change applies after admin approval. You can't submit a new request while one is pending.",
    vi: "Sau khi gửi, thay đổi sẽ được áp dụng sau khi quản trị viên duyệt. Không thể gửi yêu cầu mới khi còn yêu cầu đang chờ.",
    zh: "提交后需管理员批准才会生效。若有申请正在等待审批，则无法提交新申请。",
    th: "เมื่อส่งคำขอแล้วจะมีผลหลังผู้ดูแลอนุมัติ จะส่งคำขอใหม่ไม่ได้หากมีคำขอที่รออนุมัติอยู่",
  },

  // WorkInfoPage
  "workInfo.org": { ko: "출근조직", en: "Work Organization", vi: "Tổ chức làm việc", zh: "所属组织", th: "องค์กรที่ทำงาน" },
  "workInfo.changePending": { ko: "변경 승인대기", en: "Change Pending", vi: "Đang chờ duyệt thay đổi", zh: "变更待批准", th: "รอการอนุมัติการเปลี่ยนแปลง" },
  "workInfo.change": { ko: "변경", en: "Change", vi: "Thay đổi", zh: "变更", th: "เปลี่ยน" },
  "workInfo.noSite": { ko: "배정된 근무지가 없습니다", en: "No work site assigned", vi: "Chưa được phân công nơi làm việc", zh: "尚未分配工作地点", th: "ยังไม่ได้กำหนดสถานที่ทำงาน" },
  "workInfo.payInfo": { ko: "급여정보", en: "Payroll Info", vi: "Thông tin lương", zh: "工资信息", th: "ข้อมูลเงินเดือน" },
  "workInfo.accountHolder": { ko: "예금주", en: "Account Holder", vi: "Chủ tài khoản", zh: "账户持有人", th: "ชื่อเจ้าของบัญชี" },
  "workInfo.bank": { ko: "은행", en: "Bank", vi: "Ngân hàng", zh: "银行", th: "ธนาคาร" },
  "workInfo.accountNumber": { ko: "계좌번호", en: "Account Number", vi: "Số tài khoản", zh: "账户号码", th: "เลขบัญชี" },
  "workInfo.address": { ko: "주소", en: "Address", vi: "Địa chỉ", zh: "地址", th: "ที่อยู่" },
  "workInfo.menu.contracts": { ko: "계약관리", en: "Contracts", vi: "Hợp đồng", zh: "合同管理", th: "จัดการสัญญา" },
  "workInfo.menu.payslips": { ko: "급여관리", en: "Payslips", vi: "Bảng lương", zh: "工资管理", th: "จัดการเงินเดือน" },
  "workInfo.menu.leave": { ko: "휴가신청관리", en: "Leave Requests", vi: "Đơn xin nghỉ phép", zh: "休假申请管理", th: "จัดการคำขอลา" },
  "workInfo.hint": {
    ko: "카드를 눌러 계약서·급여명세서·휴가신청 내역을 확인하세요.",
    en: "Tap a card to view contracts, payslips, and leave request history.",
    vi: "Nhấn vào thẻ để xem hợp đồng, bảng lương và lịch sử xin nghỉ phép.",
    zh: "点击卡片查看合同、工资单和休假申请记录。",
    th: "แตะการ์ดเพื่อดูสัญญา สลิปเงินเดือน และประวัติการขอลา",
  },
  "workInfo.changeModalTitle": { ko: "배정변경 요청", en: "Request Assignment Change", vi: "Yêu cầu thay đổi phân công", zh: "申请变更分配", th: "ขอเปลี่ยนแปลงการมอบหมาย" },
  "workInfo.requestedSite": { ko: "희망 근무지", en: "Preferred Work Site", vi: "Nơi làm việc mong muốn", zh: "希望的工作地点", th: "สถานที่ทำงานที่ต้องการ" },
  "workInfo.requestedVendor": { ko: "희망 소속업체", en: "Preferred Affiliate", vi: "Đơn vị mong muốn", zh: "希望所属公司", th: "บริษัทในเครือที่ต้องการ" },
  "workInfo.notSelected": { ko: "선택 안 함", en: "Not selected", vi: "Không chọn", zh: "不选择", th: "ไม่เลือก" },
  "workInfo.reason": { ko: "사유", en: "Reason", vi: "Lý do", zh: "原因", th: "เหตุผล" },
  "workInfo.request": { ko: "요청", en: "Request", vi: "Yêu cầu", zh: "申请", th: "ขอ" },

  // SchedulePage
  "schedule.title": { ko: "예정된 스케줄", en: "Upcoming Schedule", vi: "Lịch sắp tới", zh: "预定日程", th: "ตารางที่กำลังจะมาถึง" },
  "schedule.empty": { ko: "예정된 스케줄이 없습니다.", en: "No upcoming schedule.", vi: "Không có lịch sắp tới.", zh: "暂无预定日程。", th: "ไม่มีตารางที่กำลังจะมาถึง" },

  // PayslipList
  "payslip.title": { ko: "급여관리", en: "Payslips", vi: "Bảng lương", zh: "工资管理", th: "จัดการเงินเดือน" },
  "payslip.empty": { ko: "발급된 명세서가 없습니다.", en: "No payslips issued yet.", vi: "Chưa có bảng lương nào được cấp.", zh: "暂无已发放的工资单。", th: "ยังไม่มีการออกสลิปเงินเดือน" },

  // Home (기존 + 확장)
  "home.checkedInAt": { ko: "출근완료 · {{time}}", en: "Checked in · {{time}}", vi: "Đã vào ca · {{time}}", zh: "已打卡 · {{time}}", th: "เช็คอินแล้ว · {{time}}" },
  "home.checkedOutSuffix": { ko: " · 퇴근 {{time}}", en: " · Out {{time}}", vi: " · Ra {{time}}", zh: " · 下班 {{time}}", th: " · ออก {{time}}" },
  "home.checkInHint": {
    ko: "근무지 반경 {{radius}}m 이내에서 출근 버튼을 눌러주세요",
    en: "Tap Check In within {{radius}}m of your work site",
    vi: "Nhấn nút Vào ca khi ở trong bán kính {{radius}}m quanh nơi làm việc",
    zh: "请在距工作地点 {{radius}}米范围内点击打卡按钮",
    th: "โปรดกดปุ่มเช็คอินภายในระยะ {{radius}} เมตรจากสถานที่ทำงาน",
  },
  "home.noConfirmedSchedule": {
    ko: "관리자가 오늘 출근확정 처리한 스케줄이 없습니다",
    en: "No schedule confirmed for today",
    vi: "Không có lịch làm việc nào được xác nhận hôm nay",
    zh: "今天没有管理员确认的出勤日程",
    th: "ไม่มีตารางที่ได้รับการยืนยันสำหรับวันนี้",
  },
  "home.checkIn": { ko: "출근", en: "Check In", vi: "Vào ca", zh: "上班打卡", th: "เข้างาน" },
  "home.checkOut": { ko: "퇴근", en: "Check Out", vi: "Ra ca", zh: "下班打卡", th: "ออกงาน" },
  "home.workSiteInfo": { ko: "근무지 정보", en: "Work Site Info", vi: "Thông tin nơi làm việc", zh: "工作地点信息", th: "ข้อมูลสถานที่ทำงาน" },
  "home.distanceLabel": { ko: "현재 위치까지 약 {{distance}}m", en: "About {{distance}}m from current location", vi: "Cách vị trí hiện tại khoảng {{distance}}m", zh: "距当前位置约 {{distance}}米", th: "ห่างจากตำแหน่งปัจจุบันประมาณ {{distance}} เมตร" },
  "home.inRadius": { ko: "반경 안", en: "In range", vi: "Trong phạm vi", zh: "范围内", th: "อยู่ในระยะ" },
  "home.outOfRadius": { ko: "반경 밖", en: "Out of range", vi: "Ngoài phạm vi", zh: "超出范围", th: "อยู่นอกระยะ" },
  "home.loadingLocation": { ko: "불러오는 중...", en: "Loading...", vi: "Đang tải...", zh: "加载中...", th: "กำลังโหลด..." },

  // Login
  "login.language": { ko: "언어", en: "Language", vi: "Ngôn ngữ", zh: "语言", th: "ภาษา" },
  "login.idLabel": { ko: "회원ID(휴대전화번호)", en: "ID (Phone Number)", vi: "ID (Số điện thoại)", zh: "会员ID（手机号码）", th: "ไอดี (เบอร์โทรศัพท์)" },
  "login.idPlaceholder": { ko: "대시(-) 없이 숫자만 입력", en: "Numbers only, no dashes", vi: "Chỉ nhập số, không có dấu gạch ngang", zh: "请输入数字，不含短横线", th: "กรอกเฉพาะตัวเลข ไม่ต้องใส่ขีด" },
  "login.password": { ko: "비밀번호", en: "Password", vi: "Mật khẩu", zh: "密码", th: "รหัสผ่าน" },
  "login.savePhone": { ko: "회원ID 저장", en: "Remember ID", vi: "Lưu ID", zh: "记住会员ID", th: "จดจำไอดี" },
  "login.submit": { ko: "로그인", en: "Log In", vi: "Đăng nhập", zh: "登录", th: "เข้าสู่ระบบ" },
  "login.submitting": { ko: "로그인 중...", en: "Logging in...", vi: "Đang đăng nhập...", zh: "登录中...", th: "กำลังเข้าสู่ระบบ..." },
  "login.error": {
    ko: "회원ID 또는 비밀번호가 올바르지 않습니다.",
    en: "Incorrect ID or password.",
    vi: "ID hoặc mật khẩu không đúng.",
    zh: "会员ID或密码不正确。",
    th: "ไอดีหรือรหัสผ่านไม่ถูกต้อง",
  },
  "login.noAccount": { ko: "아직 회원이 아니신가요?", en: "Don't have an account?", vi: "Bạn chưa có tài khoản?", zh: "还不是会员吗？", th: "ยังไม่ได้เป็นสมาชิกใช่ไหม?" },
  "login.signupEmployee": { ko: "직원 회원가입", en: "Employee Sign Up", vi: "Đăng ký nhân viên", zh: "员工注册", th: "สมัครสมาชิกพนักงาน" },
  "login.isAdmin": { ko: "관리자이신가요?", en: "Are you an admin?", vi: "Bạn là quản trị viên?", zh: "您是管理员吗？", th: "คุณเป็นผู้ดูแลระบบใช่ไหม?" },
  "login.adminLogin": { ko: "관리자 로그인", en: "Admin Login", vi: "Đăng nhập quản trị viên", zh: "管理员登录", th: "เข้าสู่ระบบผู้ดูแล" },
  "login.employeeLogin": { ko: "직원 로그인", en: "Employee Login", vi: "Đăng nhập nhân viên", zh: "员工登录", th: "เข้าสู่ระบบพนักงาน" },
  "login.email": { ko: "이메일", en: "Email", vi: "Email", zh: "邮箱", th: "อีเมล" },
  "login.adminEmailError": {
    ko: "이메일 또는 비밀번호가 올바르지 않습니다.",
    en: "Incorrect email or password.",
    vi: "Email hoặc mật khẩu không đúng.",
    zh: "邮箱或密码不正确。",
    th: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  },
  "login.adminSignup": { ko: "관리자(회사) 회원가입", en: "Admin (Company) Sign Up", vi: "Đăng ký quản trị viên (công ty)", zh: "管理员（企业）注册", th: "สมัครสมาชิกผู้ดูแล (บริษัท)" },
};

export const DICTIONARY = SUPPORTED_LANGUAGES.reduce((acc, l) => {
  acc[l.code] = {};
  return acc;
}, {});

Object.entries(STRINGS).forEach(([key, translations]) => {
  Object.entries(translations).forEach(([code, text]) => {
    if (!DICTIONARY[code]) return;
    DICTIONARY[code][key] = text;
  });
});
