// src/planner/PlannerMyInfo.jsx — "내정보" 메뉴 (PC/모바일 공용, 모든 구성원이 접근 가능).
// 이름/가족 이름은 스스로 수정할 수 있다(가족 이름은 초대자·받은 사람 누구나 바꿀
// 수 있고, 바뀌면 같은 가족 구성원 전체에 반영된다). 성별은 가입할 때 정한 값으로
// 고정되고(화면 색상 테마와 연결돼 있어서 나중에 바꾸면 배우자와 화면이 뒤섞일 수
// 있다), 여기서는 읽기 전용으로만 보여준다. 배우자 초대 공유와 회원 탈퇴도 여기서.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateMyProfile, updateGroupName, useGroupMembers, leavePlannerAccount, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import { shareInvite } from "./plannerInvite";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";
import PlannerDatePicker from "./PlannerDatePicker";

const GENDER_LABEL = { male: "남자", female: "여자" };

export default function PlannerMyInfo({ account, onUpdated }) {
  const navigate = useNavigate();
  const members = useGroupMembers(account.groupId);
  const resolvedGroupName = members.find((m) => m.groupName)?.groupName || account.groupName || "우리 가족";

  const [name, setName] = useState(account.name || "");
  const [groupName, setGroupName] = useState(resolvedGroupName);
  useEffect(() => { setGroupName(resolvedGroupName); }, [resolvedGroupName]);
  const [birthday, setBirthday] = useState(account.birthday || "");

  // ⭐ 이름/가족 이름/생년월일마다 따로 저장 버튼이 있던 것을, 아래쪽 오른쪽의
  // 저장 버튼 하나로 한꺼번에 저장하도록 통합했다.
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [codeCopied, setCodeCopied] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(account.groupId);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {}
  };

  const [sharing, setSharing] = useState(false);
  const [shareFlash, setShareFlash] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveInput, setLeaveInput] = useState("");
  const [leaving, setLeaving] = useState(false);
  const isMaster = account.email === TOTAL_MASTER_EMAIL;

  const saveAll = async () => {
    if (!name.trim()) { alert("이름을 입력해 주세요."); return; }
    if (!groupName.trim()) { alert("가족 이름을 입력해 주세요."); return; }
    setSaving(true);
    try {
      await Promise.all([
        updateMyProfile(account.uid, { name: name.trim(), birthday }),
        updateGroupName(account.groupId, groupName.trim()),
      ]);
      onUpdated?.({ ...account, name: name.trim(), birthday, groupName: groupName.trim() });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const invite = async () => {
    setSharing(true);
    try {
      const result = await shareInvite({ groupCode: account.groupId, groupName: resolvedGroupName, myName: account.name, myGender: account.gender });
      if (result === "copied") { setShareFlash("초대 문구를 복사했어요. 카카오톡 등에 붙여넣어 보내주세요."); setTimeout(() => setShareFlash(""), 3000); }
      if (result === "failed") { alert("공유에 실패했어요. 다시 시도해 주세요."); }
    } finally {
      setSharing(false);
    }
  };

  const doLeave = async () => {
    if (leaveInput.trim() !== "탈퇴") { alert('"탈퇴"라고 정확히 입력해 주세요.'); return; }
    setLeaving(true);
    try {
      await leavePlannerAccount();
      navigate("/planner-login", { replace: true });
    } catch (e) {
      alert("탈퇴 처리 중 오류가 발생했습니다: " + e.message);
      setLeaving(false);
    }
  };

  return (
    <div className="max-w-sm space-y-5">
      <div>
        <div className="text-[12px] font-semibold text-gray-600 mb-1.5">이름</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5 text-[13.5px] focus:outline-none"
          style={{ borderColor: ACCENT_BORDER }}
        />
      </div>

      <div>
        <div className="text-[12px] font-semibold text-gray-600 mb-1.5">가족 이름</div>
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5 text-[13.5px] focus:outline-none"
          style={{ borderColor: ACCENT_BORDER }}
        />
        <div className="text-[10.5px] text-gray-500 mt-1">초대한 사람, 초대받은 사람 누구나 바꿀 수 있어요.</div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <div className="text-[12px] font-semibold text-gray-600 mb-1.5">성별</div>
          <div
            className="py-2.5 px-3.5 rounded-lg text-[13px] font-bold border text-center"
            style={{ background: ACCENT_SOFT, color: ACCENT, borderColor: ACCENT_BORDER }}
          >
            {GENDER_LABEL[account.gender || "female"]}
          </div>
          <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">화면 색상 테마와 연결돼 있어 변경할 수 없어요.</div>
        </div>
        <div>
          <div className="text-[12px] font-semibold text-gray-600 mb-1.5">생년월일</div>
          <PlannerDatePicker
            value={birthday}
            onChange={setBirthday}
            placeholder="생일 선택"
            className="w-full text-left border rounded-lg px-3 py-2.5 text-[13px]"
          />
          <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">다가오면 알림에 나와요.</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={saveAll} disabled={saving} className="px-6 py-2.5 rounded-lg text-white text-[13px] font-bold" style={{ background: ACCENT }}>
          {saving ? "저장 중..." : savedFlash ? "저장됨" : "저장"}
        </button>
      </div>

      <div className="bg-white border rounded-xl p-3.5 space-y-1.5" style={{ borderColor: ACCENT_BORDER, background: ACCENT_SOFT }}>
        <div className="flex justify-between text-[12.5px]"><span className="text-gray-600">이메일</span><span className="font-semibold text-gray-700">{account.email}</span></div>
        <div className="flex justify-between items-center text-[12.5px]">
          <span className="text-gray-600">가족 코드</span>
          <button onClick={copyCode} className="font-bold" style={{ color: ACCENT }} title="눌러서 복사">
            {codeCopied ? "복사됨" : account.groupId}
          </button>
        </div>
        <div className="flex justify-between text-[12.5px]"><span className="text-gray-600">역할</span><span className="font-semibold text-gray-700">{isMaster ? "최고관리자" : "구성원"}</span></div>
      </div>

      <div>
        <button onClick={invite} disabled={sharing} className="w-full py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>
          {sharing ? "준비 중..." : "배우자에게 초대 공유하기"}
        </button>
        {shareFlash && <div className="text-[11px] text-gray-500 mt-1.5">{shareFlash}</div>}
      </div>

      {!isMaster && (
        <div className="pt-2 border-t" style={{ borderColor: ACCENT_SOFT }}>
          {!confirmLeave ? (
            <button onClick={() => setConfirmLeave(true)} className="text-[12px] font-semibold text-gray-500 mt-3">
              회원 탈퇴
            </button>
          ) : (
            <div className="mt-3 p-3.5 rounded-xl border border-red-200 bg-red-50">
              <div className="text-[12px] font-bold text-red-500 mb-1.5">정말 탈퇴하시겠어요?</div>
              <div className="text-[11px] text-red-400 mb-2.5 leading-relaxed">
                탈퇴하면 이 가족({resolvedGroupName})에서 나가게 되고, 로그인 계정도 함께 삭제돼요. 다시 쓰려면 재가입해야 해요.
                계속하려면 아래에 "탈퇴"라고 입력해 주세요.
              </div>
              <input
                value={leaveInput}
                onChange={(e) => setLeaveInput(e.target.value)}
                placeholder="탈퇴"
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-[13px] mb-2 focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={() => { setConfirmLeave(false); setLeaveInput(""); }} className="flex-1 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-[12.5px] font-semibold">
                  취소
                </button>
                <button onClick={doLeave} disabled={leaving} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-[12.5px] font-bold">
                  {leaving ? "처리 중..." : "탈퇴하기"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="text-center text-[10.5px] font-mono text-gray-300 mt-5">v{__APP_VERSION__}</div>
    </div>
  );
}
