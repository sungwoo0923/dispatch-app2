import { FabButton, useWinSize, ResizeGrip, WinHeader } from "./FloatDock";
import React, { useState, useRef, useEffect } from "react";
import { AI_MODES, useTeamData, teamButtons, teamAnswer } from "./aiTeamModes";

/**
 * AI 비서 플로팅 챗봇 (무료 버전 - 로컬 데이터만 활용)
 */
export default function AiAssistant({ dispatches = [], clients = [], controlledOpen, onOpenChange, mode = null, company = "", uid = "" }) {
  // ⭐ 2026-11-01 팀별 비서 — 경리(acct)·인사(hr)·임원(exec)은 그 팀에 맞는 인사말·버튼·답변
  const M = AI_MODES[mode] || null;
  const hello = M ? M.hello : "안녕하세요! 배차 AI 비서입니다.\n무엇을 도와드릴까요?";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v) => { if (onOpenChange) onOpenChange(v); else setInternalOpen(v); };
  const [messages, setMessages] = useState([{ role: "assistant", content: hello }]);
  // 화면(팀)이 바뀌면 처음 인사부터
  useEffect(() => { setMessages([{ role: "assistant", content: hello }]); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const [clientQuery, setClientQuery] = useState("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  // 날짜 파싱 (Timestamp, string 모두 지원)
  const parseDate = (val) => {
    if (!val) return "";
    if (val.toDate) return val.toDate().toISOString().slice(0, 10);
    if (val.seconds) return new Date(val.seconds * 1000).toISOString().slice(0, 10);
    return String(val).slice(0, 10);
  };

  // 배차 데이터 분석
  const getStats = () => {
    const todayList = dispatches.filter(d => {
      const date = parseDate(d.상차일자 || d.상차일 || d.상차);
      return date === today;
    });
    
    const monthList = dispatches.filter(d => {
      const date = parseDate(d.상차일자 || d.상차일 || d.상차);
      return date.startsWith(thisMonth);
    });
    
    const monthRevenue = monthList.reduce((sum, d) => sum + (Number(d.청구운임) || 0), 0);
    const todayRevenue = todayList.reduce((sum, d) => sum + (Number(d.청구운임) || 0), 0);
    const monthDriverFee = monthList.reduce((sum, d) => sum + (Number(d.기사운임) || 0), 0);
    const todayDriverFee = todayList.reduce((sum, d) => sum + (Number(d.기사운임) || 0), 0);
    
    // 최근 배차 (상차일 기준 정렬)
    const sorted = [...dispatches].sort((a, b) => {
      const dateA = parseDate(a.상차일자 || a.상차일 || a.상차);
      const dateB = parseDate(b.상차일자 || b.상차일 || b.상차);
      return dateB.localeCompare(dateA);
    });
    
    return {
      todayCount: todayList.length,
      todayRevenue,
      todayDriverFee,
      todayProfit: todayRevenue - todayDriverFee,
      monthCount: monthList.length,
      monthRevenue,
      monthDriverFee,
      monthProfit: monthRevenue - monthDriverFee,
      totalCount: dispatches.length,
      recentList: sorted.slice(0, 5)
    };
  };

  // 거래처별 매출 Top 5
  const getClientRanking = () => {
    const map = {};
    dispatches.filter(d => {
      const date = parseDate(d.상차일자 || d.상차일 || d.상차);
      return date.startsWith(thisMonth);
    }).forEach(d => {
      const name = d.거래처명 || d.거래처 || "미지정";
      if (!map[name]) map[name] = { count: 0, revenue: 0 };
      map[name].count++;
      map[name].revenue += Number(d.청구운임) || 0;
    });
    
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  };

  // 차량별 통계
  const getVehicleStats = () => {
    const map = {};
    dispatches.filter(d => {
      const date = parseDate(d.상차일자 || d.상차일 || d.상차);
      return date.startsWith(thisMonth);
    }).forEach(d => {
      const type = d.차량종류 || "미지정";
      if (!map[type]) map[type] = { count: 0, revenue: 0 };
      map[type].count++;
      map[type].revenue += Number(d.청구운임) || 0;
    });
    
    return Object.entries(map)
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  // 거래처 검색
  const searchClient = (query) => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return clients.filter(c => 
      (c.거래처명 || "").toLowerCase().includes(q) ||
      (c.사업자번호 || "").includes(q) ||
      (c.담당자 || "").toLowerCase().includes(q)
    ).slice(0, 5);
  };

  // 응답 생성
  const handleQuery = (type, extra = "") => {
    setLoading(true);
    
    setTimeout(() => {
      const stats = getStats();
      let response = "";

      switch(type) {
        case "today":
          response = `[오늘 배차 현황] ${today}\n\n`;
          response += `배차 건수: ${stats.todayCount}건\n`;
          response += `청구운임: ${stats.todayRevenue.toLocaleString()}원\n`;
          response += `기사운임: ${stats.todayDriverFee.toLocaleString()}원\n`;
          response += `수익: ${stats.todayProfit.toLocaleString()}원`;
          if (stats.todayCount === 0) {
            response = `[오늘 배차 현황] ${today}\n\n오늘 등록된 배차가 없습니다.`;
          }
          break;

        case "month":
          response = `[이번 달 매출] ${thisMonth}\n\n`;
          response += `총 배차: ${stats.monthCount}건\n`;
          response += `청구운임: ${stats.monthRevenue.toLocaleString()}원\n`;
          response += `기사운임: ${stats.monthDriverFee.toLocaleString()}원\n`;
          response += `수익: ${stats.monthProfit.toLocaleString()}원\n`;
          response += `건당 평균: ${stats.monthCount > 0 ? Math.round(stats.monthRevenue / stats.monthCount).toLocaleString() : 0}원`;
          break;

        case "recent":
          response = `[최근 배차 5건]\n\n`;
          if (stats.recentList.length === 0) {
            response += "등록된 배차가 없습니다.";
          } else {
            stats.recentList.forEach((d, i) => {
              const date = parseDate(d.상차일자 || d.상차일 || d.상차);
              response += `${i + 1}. ${date || "-"}\n`;
              response += `   ${d.거래처명 || d.거래처 || "-"}\n`;
              response += `   ${d.상차지명 || "-"} > ${d.하차지명 || "-"}\n`;
              response += `   ${(Number(d.청구운임) || 0).toLocaleString()}원\n\n`;
            });
          }
          break;

        case "clientRank":
          const ranking = getClientRanking();
          response = `[이번 달 거래처별 매출 Top5]\n\n`;
          if (ranking.length === 0) {
            response += "이번 달 배차 데이터가 없습니다.";
          } else {
            ranking.forEach((c, i) => {
              response += `${i + 1}. ${c.name}\n`;
              response += `   ${c.count}건 / ${c.revenue.toLocaleString()}원\n\n`;
            });
          }
          break;

        case "vehicleStats":
          const vStats = getVehicleStats();
          response = `[이번 달 차량별 통계]\n\n`;
          if (vStats.length === 0) {
            response += "이번 달 배차 데이터가 없습니다.";
          } else {
            vStats.forEach((v, i) => {
              response += `${i + 1}. ${v.type}\n`;
              response += `   ${v.count}건 / ${v.revenue.toLocaleString()}원\n\n`;
            });
          }
          break;

        case "client":
          const results = searchClient(extra);
          response = `[거래처 검색: "${extra}"]\n\n`;
          if (results.length === 0) {
            response += "검색 결과가 없습니다.";
          } else {
            results.forEach((c, i) => {
              response += `${i + 1}. ${c.거래처명 || "-"}\n`;
              response += `   사업자번호: ${c.사업자번호 || "-"}\n`;
              response += `   담당자: ${c.담당자 || "-"} ${c.연락처 || ""}\n`;
              response += `   주소: ${c.주소 || "-"}\n\n`;
            });
          }
          break;

        case "summary":
          response = `[전체 현황 요약]\n\n`;
          response += `오늘 배차: ${stats.todayCount}건 (${stats.todayRevenue.toLocaleString()}원)\n`;
          response += `이번 달: ${stats.monthCount}건 (${stats.monthRevenue.toLocaleString()}원)\n`;
          response += `이번 달 수익: ${stats.monthProfit.toLocaleString()}원\n`;
          response += `전체 배차: ${stats.totalCount}건\n`;
          response += `등록 거래처: ${clients.length}곳`;
          break;

        default:
          response = "원하시는 기능을 버튼으로 선택해주세요.";
      }

      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      setLoading(false);
    }, 300);
  };

  const T = useTeamData(mode, company, uid, open);
  const tb = teamButtons(mode);
  const askTeam = (k, label) => { setMessages((prev) => [...prev, { role: "user", content: label }]); setLoading(true); setTimeout(() => { setMessages((prev) => [...prev, { role: "assistant", content: teamAnswer(mode, k, T, dispatches) }]); setLoading(false); }, 250); };
  const quickButtons = tb ? tb.map(([k, label]) => ({ label, action: () => askTeam(k, label) })) : [
    { label: "오늘 배차", action: () => handleQuery("today") },
    { label: "이번달 매출", action: () => handleQuery("month") },
    { label: "최근 배차", action: () => handleQuery("recent") },
    { label: "거래처 순위", action: () => handleQuery("clientRank") },
    { label: "차량별 통계", action: () => handleQuery("vehicleStats") },
    { label: "전체 요약", action: () => handleQuery("summary") },
  ];

  const win = useWinSize("ai", { S: { w: 360, h: 460 }, M: { w: 440, h: 600 }, L: { w: 640, h: 820 } });
  return (
    <>
      {/* 플로팅 버튼 — 공용 독 디자인 */}
      <FabButton bottom={24} active={open} title="AI 비서" onClick={() => setOpen(!open)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
      </FabButton>

      {/* 채팅 패널 — 크기 조절(작게·보통·크게 · 왼쪽 위 모서리 드래그) */}
      {open && (
        <div data-ro-allow style={{ position: "fixed", bottom: 24, right: 92, width: win.w, height: win.h, zIndex: 9999 }}
             className="bg-white rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] border border-[#DCE3EE] flex flex-col overflow-hidden">
          <ResizeGrip onMouseDown={win.startDrag} />
          <WinHeader code="AI · ASSISTANT" title={M ? M.title : "배차 AI 비서"} sub={M ? M.sub : "배차 현황 조회"} preset={win.preset} onPreset={win.setPreset} onClose={() => setOpen(false)}
            right={<button type="button" onClick={() => setMessages([{ role: "assistant", content: hello }])} style={{ height: 26, padding: "0 9px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>초기화</button>} />

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F4F6FA] min-h-[160px]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] px-4 py-3 rounded-xl text-[15px] leading-relaxed whitespace-pre-wrap
                  ${msg.role === "user" 
                    ? "bg-[#1B2B4B] text-white rounded-br-md" 
                    : "bg-white text-[#0F1A30] shadow-sm border border-[#E3E8F0] rounded-bl-md"}`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white px-4 py-3 rounded-xl shadow-sm border">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "0ms"}}></span>
                    <span className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "150ms"}}></span>
                    <span className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "300ms"}}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 빠른 버튼 */}
          <div className="px-4 py-3 border-t bg-white">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {quickButtons.map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.action}
                  disabled={loading}
                  className="px-3 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg
                           hover:bg-[#EEF3FC] hover:text-[#1B2B4B] transition disabled:opacity-50"
                >
                  {btn.label}
                </button>
              ))}
            </div>
            
            {/* 거래처 검색(배차 비서만) */}
            <div className={`flex gap-2 ${M ? "hidden" : ""}`}>
              <input
                type="text"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && clientQuery.trim()) {
                    setMessages(prev => [...prev, { role: "user", content: `거래처: ${clientQuery}` }]);
                    handleQuery("client", clientQuery);
                    setClientQuery("");
                  }
                }}
                placeholder="거래처명 검색"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm 
                         focus:outline-none focus:ring-2 focus:ring-[#2D4C82]"
                disabled={loading}
              />
              <button
                onClick={() => {
                  if (clientQuery.trim()) {
                    setMessages(prev => [...prev, { role: "user", content: `거래처: ${clientQuery}` }]);
                    handleQuery("client", clientQuery);
                    setClientQuery("");
                  }
                }}
                disabled={loading || !clientQuery.trim()}
                className="px-4 py-2.5 bg-[#0F1A30] text-white rounded-xl font-black text-sm font-medium
                         hover:bg-[#1B2B4B] disabled:opacity-50 transition"
              >
                검색
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
