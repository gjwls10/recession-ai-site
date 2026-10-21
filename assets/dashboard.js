import {
  addMonths, areaSeries, bandChip, bandOf, base, chart, css, episodeRanges, esc, fail, loadAll, num, officialRanges,
  pct, pp, shell, showWarnings, tableToggle, tabs, toDate, ymLabel,
} from "./common.js";

shell("index");

const LABELS = {
  gdp_real: "실질 GDP", industrial_production: "산업생산", retail_sales: "소매판매", cpi: "소비자물가",
  term_spread: "장단기금리차", bsi_mfg_outlook: "제조업 전망 BSI", leading_index: "선행종합지수",
  diffusion_mining_mfg: "생산확산지수(광공업)", diffusion_services: "생산확산지수(서비스업)",
};

loadAll(["meta", "probabilities", "summary", "target", "reference", "cycles", "model"]).then((d) => {
  const { meta, probabilities: probs, summary, target, reference, cycles, model } = d;
  document.getElementById("generated").textContent = `생성: ${meta.generated_at.replace("T", " ")}`;
  document.getElementById("lead").textContent =
    `선행종합지수의 하강 신호를 기준으로 추정한 확률입니다. 기준월 ${ymLabel(meta.base_month)}.`;
  showWarnings(document.getElementById("warnings"), meta.warnings);

  const last = probs[probs.length - 1], prev = probs[probs.length - 2];
  const weak = (k) => (model.horizons[k].metrics.main.auc ?? 1) < 0.7;

  // 핵심 숫자
  const b = bandOf(last.nowcast, meta.thresholds);
  document.getElementById("hero").innerHTML = `
    <div class="stat-label">현재 침체 확률 (${ymLabel(last.date)})</div>
    <div class="hero-number">${num(last.nowcast * 100)}<small>%</small></div>
    <div style="margin:6px 0">${bandChip(b)}</div>
    <div class="delta">전월 대비 ${pp(last.nowcast - prev.nowcast)}</div>
    ${last.imputed ? '<div class="stat-note">일부 지표가 아직 공표되지 않아 직전 값으로 채운 추정이 포함되어 있습니다.</div>' : ""}`;

  document.getElementById("horizon-cards").innerHTML = meta.horizons.filter((h) => h.h > 0).map((h) => {
    const p = last[h.key], band = bandOf(p, meta.thresholds);
    return `<div class="card">
      <div class="stat-label">${h.label} (${ymLabel(addMonths(last.date, h.h))})${weak(h.key) ? '<span class="badge">참고용</span>' : ""}</div>
      <div class="stat-value">${pct(p)}</div>
      <div style="margin:4px 0">${bandChip(band)}</div>
      <div class="delta">전월 대비 ${pp(p - prev[h.key])}</div></div>`;
  }).join("");

  document.getElementById("summary").innerHTML = `<h2>이번 달 요약</h2>${summary.dashboard.map((s) => `<p>${esc(s)}</p>`).join("")}`;

  // 확률 추이
  const thresholds = meta.thresholds.slice(1);
  const pendingStart = addMonths(meta.target_asof, 1);
  let current = "nowcast";
  const probChart = chart(document.getElementById("prob-chart"), () => {
    const h = meta.horizons.find((x) => x.key === current).h;
    const rows = probs.map((r) => [toDate(addMonths(r.date, h)), r[current] * 100, r.wf[current] == null ? null : r.wf[current] * 100]);
    const lastTarget = addMonths(last.date, h);
    return base({
      grid: { left: 48, right: 64, top: document.getElementById("prob-chart").clientWidth < 640 ? 92 : 40, bottom: 36 },
      yAxis: { ...base().yAxis, min: 0, max: 100, axisLabel: { color: css("--muted"), formatter: "{value}%" } },
      tooltip: { ...base().tooltip, valueFormatter: (v) => (v == null ? "–" : `${num(v)}%`) },
      series: [
        areaSeries("하강 신호 구간 (타깃)", episodeRanges(target.episodes), css("--episode")),
        areaSeries("공식 기준순환 수축 (참고)", officialRanges(cycles), css("--official")),
        areaSeries("타깃 미공표 (예측만)", [[pendingStart, addMonths(lastTarget, 1)]], css("--pending")),
        {
          name: "모델 확률", type: "line", showSymbol: false, data: rows.map((r) => [r[0], r[1]]),
          lineStyle: { width: 2, color: css("--s1") }, itemStyle: { color: css("--s1") },
          markLine: {
            silent: true, symbol: "none", lineStyle: { color: css("--axis"), type: "dashed", width: 1 },
            label: { color: css("--muted"), formatter: (p) => p.name, position: "end", fontSize: 11 },
            data: thresholds.map((t) => ({ name: `${t.band} ${t.min * 100}%`, yAxis: t.min * 100 })),
          },
        },
        {
          name: "과거 시점 예측 (검증용)", type: "line", showSymbol: false, data: rows.map((r) => [r[0], r[2]]),
          lineStyle: { width: 1.2, type: "dashed", color: css("--ink-2") }, itemStyle: { color: css("--ink-2") },
        },
      ],
    });
  });
  const sub = () => {
    const h = meta.horizons.find((x) => x.key === current);
    document.getElementById("prob-sub").textContent = h.h === 0
      ? "가로축은 대상 월입니다. 실선은 현재 모델, 점선은 그 시점까지의 데이터만으로 냈던 예측(워크포워드)입니다."
      : `가로축은 대상 월(예측 시점 + ${h.h}개월)입니다. 실선은 현재 모델, 점선은 그 시점까지의 데이터만으로 냈던 예측입니다.` +
        (weak(current) ? " 이 기간의 예측은 검증 성능이 기준에 못 미쳐 참고용입니다." : "");
  };
  sub();
  tabs(document.getElementById("prob-tabs"), meta.horizons.map((h) => ({ key: h.key, label: h.label })), current, (k) => {
    current = k; sub(); probChart.render();
  });
  tableToggle(document.getElementById("prob-table"), ["예측 시점", "현재", "3개월 후", "6개월 후", "12개월 후", "추정 포함"],
    probs.slice().reverse().map((r) => [r.date, pct(r.nowcast), pct(r.h3), pct(r.h6), pct(r.h12), r.imputed ? "예" : ""]));

  // 선행종합지수 신호 (최근 24개월)
  const sig = target.series.filter((r) => r.S != null).slice(-24);
  document.getElementById("signal-sub").textContent =
    `원지수 전년동월비. 기준선 ${num(target.threshold)}% 아래가 3개월 이상 이어지면 하강 신호 구간입니다. 최신 ${ymLabel(sig[sig.length - 1].date)}.`;
  chart(document.getElementById("signal-chart"), () => base({
    grid: { left: 44, right: 16, top: 16, bottom: 30 }, legend: { show: false },
    tooltip: { ...base().tooltip, valueFormatter: (v) => `${num(v)}%` },
    yAxis: { ...base().yAxis, axisLabel: { color: css("--muted"), formatter: "{value}%" } },
    series: [{
      name: "전년동월비", type: "line", showSymbol: false, data: sig.map((r) => [toDate(r.date), r.S]),
      lineStyle: { width: 2, color: css("--s1") }, itemStyle: { color: css("--s1") },
      markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ink-2"), type: "dashed" },
        label: { formatter: `기준선 ${target.threshold}%`, color: css("--ink-2"), fontSize: 11, position: "insideEndTop" }, data: [{ yAxis: target.threshold }] },
    }],
  }));
  tableToggle(document.getElementById("signal-table"), ["월", "원지수", "전년동월비(%)"],
    sig.slice().reverse().map((r) => [r.date, num(r.level), num(r.S)]));

  // 생산확산지수 (최근 24개월, 3개월 평균)
  const ref = reference.slice(-24);
  const [c1, c2] = [css("--s1"), css("--s2")];
  chart(document.getElementById("diffusion-chart"), () => base({
    grid: { left: 36, right: 16, top: 30, bottom: 30 },
    tooltip: { ...base().tooltip, valueFormatter: (v) => num(v) },
    series: [
      { name: "광공업", type: "line", showSymbol: false, data: ref.map((r) => [toDate(r.date), r.mining_mfg_ma3]),
        lineStyle: { width: 2, color: c1 }, itemStyle: { color: c1 },
        markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ink-2"), type: "dashed" },
          label: { formatter: "50", color: css("--ink-2"), fontSize: 11, position: "insideEndTop" }, data: [{ yAxis: 50 }] } },
      { name: "서비스업", type: "line", showSymbol: false, data: ref.map((r) => [toDate(r.date), r.services_ma3]),
        lineStyle: { width: 2, color: c2 }, itemStyle: { color: c2 } },
    ],
  }));
  tableToggle(document.getElementById("diffusion-table"), ["월", "광공업", "서비스업", "광공업(3개월 평균)", "서비스업(3개월 평균)"],
    ref.slice().reverse().map((r) => [r.date, num(r.mining_mfg), num(r.services), num(r.mining_mfg_ma3), num(r.services_ma3)]));

  // 데이터 기준
  document.getElementById("asof").innerHTML =
    `<dt>예측 기준월</dt><dd>${ymLabel(meta.base_month)}</dd>
     <dt>타깃 기준월</dt><dd>${ymLabel(meta.target_asof)} (파일 받은 날 ${meta.target_downloaded})</dd>` +
    Object.entries(meta.data_asof).map(([k, v]) => `<dt>${LABELS[k] || k}</dt><dd>${ymLabel(v)}</dd>`).join("") +
    `<dt>모델</dt><dd>${esc(meta.model_version)}</dd>`;
}).catch(fail);
