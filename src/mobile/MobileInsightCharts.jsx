// ======================= src/mobile/MobileInsightCharts.jsx =======================
// ⚡ 2026-11-24 LTE 속도 — 모바일 인사이트(매출 분석) 화면의 차트 두 개만 따로 뗀 파일.
//  차트 라이브러리(recharts · 약 110KB)는 이 화면을 열 때 받는다(예전엔 모바일 첫 화면이 같이 받았다). 모양 · 값은 예전과 똑같다.
import React from "react";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

// 최근 6개월 매출 추이(매출 · 수익 선)
export function TrendLineChart({ data, cardVersionB }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{top:4,right:8,left:0,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="ym" tick={{fontSize:10,fill:"#9CA3AF"}} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v=>v>=1000000?`${(v/1000000).toFixed(0)}M`:v>=10000?`${Math.round(v/10000)}만`:`${v}`} tick={{fontSize:9,fill:"#9CA3AF"}} axisLine={false} tickLine={false} width={36} />
        <Tooltip formatter={(v,n)=>[`${v.toLocaleString()}원`, n]} contentStyle={{borderRadius:10,fontSize:11}} />
        <Line type="monotone" dataKey="매출" stroke={cardVersionB ? "#1B2B4B" : "#2563eb"} strokeWidth={2.5} dot={false} activeDot={{r:4}} />
        <Line type="monotone" dataKey="수익" stroke="#6B7280" strokeWidth={2} dot={false} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 요일별 수주 현황(가장 많은 요일만 진하게)
export function DayBarChart({ data, maxDay, cardVersionB }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barSize={22} margin={{top:0,right:4,left:0,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="day" tick={{fontSize:11,fill:"#6B7280"}} axisLine={false} tickLine={false} />
        <YAxis tick={{fontSize:9,fill:"#9CA3AF"}} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{borderRadius:10,fontSize:11}} formatter={(v)=>[`${v}건`,"건수"]} />
        <Bar dataKey="건수" radius={[4,4,0,0]}>
          {data.map((d,i) => <Cell key={i} fill={d.건수===maxDay?(cardVersionB?"#1B2B4B":"#2563eb"):"#D1D5DB"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
