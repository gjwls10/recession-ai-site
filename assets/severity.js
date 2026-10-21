import { base, chart, css, esc, fail, loadAll, num, shell, tableToggle, toDate, ymLabel } from "./common.js";

shell("severity");

const PATH_LABEL = {
  S: "선행종합지수 전년동월비 (%)",
  industrial_production: "산업생산 전년동월비 (%)",
  bsi_mfg_outlook: "제조업 전망 BSI",
  diffusion: "생산확산지수 두 부문 평균 (3개월 평균)",
};

loadAll(["meta", "severity", "target"]).then(({ meta, severity: S, target }) => {
  document.getElementById("generated").textContent = `생성: ${meta.generated_at.replace("T", " ")}`;
  const cur = S.current;
  const inEpisode = cur.state === "하강 국면";

  document.getElementById("score-sub").textContent = inEpisode
    ? `${ymLabel(cur.date)} 기준 '${cur.band}'. 깊이와 지속 기간을 과거 하강 구간과 비교한 백분위 평균입니다.`
    : `${ymLabel(cur.date)} 기준 하강 국면이 아니어서 점수는 0입니다 (해당 없음).`;
  chart(document.getElementById("gauge"), () => ({
    animation: false,
    series: [{
      type: "gauge", startAngle: 200, endAngle: -20, min: 0, max: 100, radius: "95%", center: ["50%", "62%"],
      axisLine: { lineStyle: { width: 14, color: [[0.33, css("--warning")], [0.66, css("--serious")], [1, css("--critical")]] } },
      pointer: { show: inEpisode, width: 5, length: "60%", itemStyle: { color: css("--ink") } },
      axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: css("--muted"), distance: -36, fontSize: 11,
        formatter: (v) => ({ 0: "0", 33: "보통", 66: "심각", 100: "100" }[v] ?? "") },
      detail: { valueAnimation: false, offsetCenter: [0, inEpisode ? "28%" : "0%"], fontSize: inEpisode ? 26 : 20, fontWeight: 700, color: css("--ink"),
        formatter: () => (inEpisode ? `${num(cur.score, 0)} · ${cur.band}` : "해당 없음") },
      data: [{ value: cur.score }],
    }],
  }));

  const b = cur.breadth;
  document.getElementById("tiles").innerHTML = [
    ["상태", cur.state, `신호 ${num(cur.S)}% (기준선 ${num(cur.threshold)}%)`],
    ["깊이", `${num(cur.depth)}%p`, "기준선 아래로 내려간 폭"],
    ["지속", `${cur.duration}개월`, "현재 하강 구간 경과"],
    ["폭 (실물)", b.label, `광공업 ${num(b.mining_mfg)} · 서비스업 ${num(b.services)} (3개월 평균, ${ymLabel(b.date)})`],
  ].map(([k, v, note]) => `<div class="card"><div class="stat-label">${k}</div><div class="stat-value" style="font-size:20px">${esc(v)}</div>
    <div class="stat-note">${esc(note)}</div></div>`).join("");

  // 실제 경로 + 예측
  const actual = target.series.filter((r) => r.S != null).slice(-36);
  const fc = S.forecast;
  document.getElementById("path-sub").textContent =
    `실선은 ${ymLabel(actual.at(-1).date)}까지 공표된 값, 점은 ${ymLabel(fc[0].base_month)} 기준 예측(현재·3·6·12개월 후)이며 음영은 90% 예측 구간입니다.`;
  chart(document.getElementById("path-chart"), () => {
    const c1 = css("--s1"), c2 = css("--s2");
    return base({
      tooltip: { ...base().tooltip, valueFormatter: (v) => (v == null ? "–" : `${num(v)}%`) },
      yAxis: { ...base().yAxis, axisLabel: { color: css("--muted"), formatter: "{value}%" } },
      series: [
        { name: "공표된 신호", type: "line", showSymbol: false, data: actual.map((r) => [toDate(r.date), r.S]),
          lineStyle: { width: 2, color: c1 }, itemStyle: { color: c1 },
          markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ink-2"), type: "dashed" },
            label: { formatter: `기준선 ${cur.threshold}%`, position: "insideEndTop", color: css("--ink-2"), fontSize: 11 },
            data: [{ yAxis: cur.threshold }] } },
        { name: "예측 구간 하단", type: "line", stack: "band", symbol: "none", lineStyle: { opacity: 0 },
          data: fc.map((f) => [toDate(f.target_month), f.lo]), tooltip: { show: false } },
        { name: "90% 예측 구간", type: "line", stack: "band", symbol: "none", lineStyle: { opacity: 0 },
          areaStyle: { color: c2, opacity: 0.15 }, itemStyle: { color: c2 },
          data: fc.map((f) => [toDate(f.target_month), f.hi - f.lo]), tooltip: { show: false } },
        { name: "예측", type: "line", data: fc.map((f) => [toDate(f.target_month), f.S]), symbolSize: 8,
          lineStyle: { width: 1.5, type: "dashed", color: c2 }, itemStyle: { color: c2 } },
      ],
      legend: { ...base().legend, data: ["공표된 신호", "예측", "90% 예측 구간"] },
    });
  });
  tableToggle(document.getElementById("path-table"), ["대상 월", "예측(%)", "하단", "상단"],
    fc.map((f) => [f.target_month, num(f.S), num(f.lo), num(f.hi)]));

  // 과거 구간 비교
  const sel = document.getElementById("indicator");
  sel.innerHTML = Object.entries(PATH_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  let key = "S";
  const epChart = chart(document.getElementById("episode-chart"), () => {
    const paths = S.paths[key];
    const names = Object.keys(paths).filter((n) => n !== "현재");
    const offsets = paths[names[0]].map((r) => r[0]);
    const avg = offsets.map((o, i) => {
      const vals = names.map((n) => paths[n][i][1]).filter((v) => v != null);
      return [o, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
    });
    const gray = css("--muted");
    return base({
      grid: { left: 52, right: 20, top: 40, bottom: 44 },
      tooltip: { ...base().tooltip, valueFormatter: (v) => (v == null ? "–" : num(v)) },
      xAxis: { type: "value", min: S.path_offsets[0], max: S.path_offsets[1], interval: 6, name: "구간 시작 기준 개월",
        nameLocation: "middle", nameGap: 28, nameTextStyle: { color: css("--muted") },
        axisLine: { lineStyle: { color: css("--axis") } }, axisLabel: { color: css("--muted") }, splitLine: { show: false } },
      legend: { ...base().legend, data: ["과거 구간", "과거 평균", "현재"] },
      series: [
        ...names.map((n, i) => ({ name: "과거 구간", id: n, type: "line", showSymbol: false, data: paths[n],
          lineStyle: { width: 1, color: gray, opacity: 0.55 }, itemStyle: { color: gray }, emphasis: { focus: "series" },
          tooltip: { valueFormatter: (v) => (v == null ? "–" : `${num(v)} (${n})`) },
          ...(i === 0 ? { markLine: { silent: true, symbol: "none", lineStyle: { color: css("--axis") }, label: { show: false },
            data: [{ xAxis: 0 }] } } : {}) })),
        { name: "과거 평균", type: "line", showSymbol: false, data: avg, lineStyle: { width: 2.5, type: "dashed", color: css("--ink-2") },
          itemStyle: { color: css("--ink-2") } },
        { name: "현재", type: "line", showSymbol: false, data: paths["현재"], lineStyle: { width: 2.5, color: css("--s1") },
          itemStyle: { color: css("--s1") } },
      ],
    });
  });
  const epTable = document.getElementById("episode-chart-table");
  const drawTable = () => {
    epTable.innerHTML = "";
    const paths = S.paths[key], names = Object.keys(paths);
    tableToggle(epTable, ["개월", ...names], paths[names[0]].map((r, i) =>
      [r[0], ...names.map((n) => (paths[n][i] ? num(paths[n][i][1]) : "–"))]));
  };
  drawTable();
  sel.addEventListener("change", () => { key = sel.value; epChart.render(); drawTable(); });

  document.getElementById("episodes").innerHTML =
    `<thead><tr><th>기간</th><th>개월</th><th>최대 깊이(%p)</th><th>최저 신호(%)</th><th>생산확산 두 부문 50 미만 비율</th><th>공식 수축 국면과 겹친 개월</th></tr></thead><tbody>` +
    S.episodes.map((e) => `<tr><td>${e.start} ~ ${e.end}</td><td>${e.months}</td><td>${num(e.max_depth, 2)}</td><td>${num(e.min_S, 2)}</td>
      <td>${e.diffusion_both_below_share == null ? "–" : `${num(e.diffusion_both_below_share * 100, 0)}%`}</td><td>${e.official_overlap_months}</td></tr>`).join("") +
    "</tbody>";
}).catch(fail);
