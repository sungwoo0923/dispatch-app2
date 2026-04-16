import React, { useState, useRef, useEffect } from "react";

/**
 * AI 비서 플로팅 챗봇
 * props:
 *   - dispatches: 배차 데이터 배열
 *   - clients: 거래처 데이터 배열
 *   - calcFare: 운임 계산 함수 (optional)
 */
export default function AiAssistant({ dispatches = [], clients = [], calcFare }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "안녕하세요! 배차 AI 비서입니다. 무엇을 도와드릴까요?\n\n예시 질문:\n• 오늘 배차 현황 알려줘\n• 이번 달 매출 요약해줘\n• [거래처명] 정보 조회해줘\n• 1톤 카고 서울→부산 운임 알려줘" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  // 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 오늘 날짜
  const today = new Date().toISOString().slice(0, 10);

  // 배차 데이터 요약 생성
  const getDispatchSummary = () => {
    const todayDispatches = dispatches.filter(d => d.날짜 === today || d.배차일자 === today);
    const thisMonth = dispatches.filter(d => {
      const date = d.날짜 || d.배차일자 || "";
      return date.startsWith(today.slice(0, 7));
    });
    
    const totalFare = thisMonth.reduce((sum, d) => sum + (Number(d.운임) || 0), 0);
    const totalCount = thisMonth.length;
    
    return {
      오늘배차: todayDispatches.length,
      이번달배차: totalCount,
      이번달매출: totalFare,
      전체배차: dispatches.length,
      최근배차: dispatches.slice(-10)
    };
  };

  // 거래처 검색
  const searchClient = (query) => {
    return clients.filter(c => 
      (c.거래처명 || "").includes(query) || 
      (c.사업자번호 || "").includes(query)
    ).slice(0, 5);
  };

  // Claude API 호출
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      // 배차 컨텍스트 준비
      const summary = getDispatchSummary();
      
      // 거래처 검색 (질문에 거래처명이 있으면)
      const clientMatches = searchClient(userMsg);
      
      const systemPrompt = `당신은 운송사 배차팀의 AI 비서입니다. 친절하고 간결하게 답변하세요.

## 현재 배차 데이터 요약
- 오늘(${today}) 배차: ${summary.오늘배차}건
- 이번 달 배차: ${summary.이번달배차}건
- 이번 달 매출: ${summary.이번달매출.toLocaleString()}원
- 전체 배차 건수: ${summary.전체배차}건

## 최근 배차 10건
${JSON.stringify(summary.최근배차.map(d => ({
  날짜: d.날짜 || d.배차일자,
  거래처: d.거래처명 || d.거래처,
  상차지: d.상차지,
  하차지: d.하차지,
  차량: d.차량종류,
  운임: d.운임
})), null, 2)}

## 검색된 거래처 정보
${clientMatches.length > 0 ? JSON.stringify(clientMatches, null, 2) : "해당 거래처 없음"}

## 답변 규칙
1. 배차 현황, 매출 관련 질문은 위 데이터를 기반으로 답변
2. 거래처 조회 시 검색된 거래처 정보 활용
3. 운임 계산 질문은 차량종류, 출발지, 도착지를 확인 후 안내
4. 모르는 정보는 솔직히 모른다고 답변
5. 답변은 간결하게, 핵심만`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            ...messages.filter(m => m.role !== "assistant" || messages.indexOf(m) > 0).map(m => ({
              role: m.role,
              content: m.content
            })),
            { role: "user", content: userMsg }
          ]
        })
      });

      const data = await response.json();
      const assistantMsg = data.content?.[0]?.text || "죄송합니다. 응답을 생성하지 못했습니다.";
      
      setMessages(prev => [...prev, { role: "assistant", content: assistantMsg }]);
    } catch (error) {
      console.error("AI 비서 오류:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 빠른 질문 버튼
  const quickQuestions = [
    "오늘 배차 현황",
    "이번 달 매출",
    "최근 배차 목록"
  ];

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 
                   text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 
                   transition-all duration-200 flex items-center justify-center z-[9999]"
        title="AI 비서"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl 
                        border border-gray-200 flex flex-col z-[9999] overflow-hidden">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <div className="font-semibold">배차 AI 비서</div>
              <div className="text-xs text-blue-100">무엇이든 물어보세요</div>
            </div>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap
                  ${msg.role === "user" 
                    ? "bg-blue-500 text-white rounded-br-md" 
                    : "bg-white text-gray-800 shadow-sm border rounded-bl-md"}`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "0ms"}}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "150ms"}}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "300ms"}}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 빠른 질문 */}
          {messages.length <= 1 && (
            <div className="px-4 py-2 border-t bg-white flex gap-2 flex-wrap">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); }}
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-full 
                           hover:bg-blue-100 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 입력 영역 */}
          <div className="p-3 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="메시지를 입력하세요..."
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-full text-sm 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center
                         hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
