import {
  base, chart, css, esc, fail, loadAll, num, pct, pp, seriesColors, shell, showWarnings, tableToggle, tabs, toDate, ymLabel,
} from "./common.js";

shell("drivers");

loadAll(["meta", "contributions", "summary", "model"]).then(({ meta, contributions: C, summary, model }) => {
  document.getElementById("generated").textContent = `생성: ${meta.generated_at.replace("T", " ")}`;
  const feats = C.features;
  const label = Object.fromEntries(feats.map((f) => [f.id, f.label + (f.overlaps_target ? " *" : "")]));
  let key = "nowcast";
  // 예측 기간마다 모델 피처가 다르다. 그 기간에 쓰는 피처만 보여 준다
  const used = () => feats.filter((f) => (C.horizons[key].features ?? feats.map((x) => x.id)).includes(f.id));

  const containers = ["current-table", "change-table", "sector-table"].map((id) => document.getElementById(id));
  const charts = [];

  function texts() {
    const h = meta.horizons.find((x) => x.key === key);
    const weak = (model.horizons[key].metrics.main.auc ?? 1) < 0.7;
    showWarnings(document.getElementById("warnings"), weak
      ? [`${h.label} 확률은 과거 검증 성능(AUC ${num(model.horizons[key].metrics.main.auc, 2)})이 기준에 못 미쳐 참고용입니다.`] : []);
    const series = C.horizons[key].series, last = series[series.length - 1];
    document.getElementById("summary").innerHTML =
      `<h2>${h.label} 확률 ${pct(last.prob)} (${ymLabel(last.date)})</h2><p>${esc(summary.drivers[key].text)}</p>`;
    document.getElementById("current-sub").textContent =
      `${ymLabel(last.date)} 기준. 빨강은 확률을 높이는 쪽, 파랑은 낮추는 쪽입니다. 평균 상태일 때 확률은 ${pct(C.horizons[key].baseline_prob)}이고, ` +
      "막대는 그 상태에서 지표 하나만 지금 값으로 바꿨을 때의 차이(근사)입니다. * 표시는 선행종합지수 구성 재료와 겹치는 지표입니다.";
    document.getElementById("change-sub").textContent =
      `${ymLabel(series[series.length - 2].date)} ${pct(series[series.length - 2].prob)} → ${ymLabel(last.date)} ${pct(last.prob)}. ` +
      "확률 변화를 지표별로 나눈 값입니다. 변화를 보기 쉽게 세로축은 0이 아닌 값에서 시작합니다.";
  }

  function tables() {
    containers.forEach((c) => { c.innerHTML = ""; });
    const series = C.horizons[key].series, last = series[series.length - 1];
    tableToggle(containers[0], ["피처", "부문", "확률 기여(%p)", "로그오즈 기여"],
      used().map((f) => [label[f.id], f.sector, pp(last.prob_pp[f.id]), num(last.values[f.id], 3)]));
    tableToggle(containers[1], ["피처", "전월 대비 기여(%p)"],
      used().map((f) => [label[f.id], pp(last.change_pp[f.id])]).concat([["합계 (확률 변화)", pp(last.change_prob)]]));
    tableToggle(containers[2], ["월", ...C.sectors, "확률"],
      series.slice().reverse().map((r) => [r.date, ...C.sectors.map((s) => pp(r.sector_pp[s])), pct(r.prob)]));
  }

  // 현재 기여도 막대
  charts.push(chart(document.getElementById("current-chart"), () => {
    const last = C.horizons[key].series.at(-1);
    const rows = used().map((f) => [label[f.id], last.prob_pp[f.id] * 100]).sort((a, b) => a[1] - b[1]);
    return base({
      grid: { left: 190, right: 40, top: 10, bottom: 30 }, legend: { show: false },
      tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => `${esc(p.name)}<br>${p.value >= 0 ? "+" : ""}${num(p.value)}%p` },
      xAxis: { type: "value", axisLabel: { color: css("--muted"), formatter: "{value}%p" }, splitLine: { lineStyle: { color: css("--grid") } } },
      yAxis: { type: "category", data: rows.map((r) => r[0]), axisLine: { lineStyle: { color: css("--axis") } }, axisTick: { show: false },
        axisLabel: { color: css("--ink-2"), width: 180, overflow: "truncate" } },
      series: [{
        type: "bar", barMaxWidth: 18,
        data: rows.map((r) => ({ value: r[1], itemStyle: { color: r[1] >= 0 ? css("--up") : css("--down"),
          borderRadius: r[1] >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
        label: { show: true, position: "right", color: css("--ink-2"), fontSize: 11,
          formatter: (p) => `${p.value >= 0 ? "+" : "−"}${num(Math.abs(p.value))}` },
      }],
    });
  }));

  // 전월 대비 폭포수
  charts.push(chart(document.getElementById("change-chart"), () => {
    const s = C.horizons[key].series, last = s.at(-1), prev = s.at(-2);
    const steps = used().map((f) => [label[f.id], last.change_pp[f.id] * 100])
      .filter((r) => Math.abs(r[1]) >= 0.005).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const cats = ["전월 확률", ...steps.map((r) => r[0]), "이번 달 확률"];
    let level = prev.prob * 100;
    const invisible = [0], vis = [{ value: prev.prob * 100, itemStyle: { color: css("--ink-2") } }];
    for (const [, d] of steps) {
      invisible.push(Math.min(level, level + d));
      vis.push({ value: Math.abs(d), raw: d, itemStyle: { color: d >= 0 ? css("--up") : css("--down") } });
      level += d;
    }
    invisible.push(0);
    vis.push({ value: last.prob * 100, itemStyle: { color: css("--ink-2") } });
    // 변화 막대가 보이도록 y축 시작값을 확률 범위 근처로 둔다
    const levels = [prev.prob * 100, last.prob * 100];
    let acc = prev.prob * 100;
    for (const [, d] of steps) { acc += d; levels.push(acc); }
    const lo = Math.min(...levels), hi = Math.max(...levels);
    const yMin = Math.max(0, Math.floor((lo - Math.max(hi - lo, 0.2) * 1.5) * 10) / 10);
    return base({
      grid: { left: 48, right: 16, top: 16, bottom: 70 }, legend: { show: false },
      tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => {
        const v = p.data.raw;
        return `${esc(p.name)}<br>${v == null ? `${num(p.value)}%` : `${v >= 0 ? "+" : "−"}${num(Math.abs(v), 2)}%p`}`;
      } },
      xAxis: { type: "category", data: cats, axisLine: { lineStyle: { color: css("--axis") } }, axisTick: { show: false },
        axisLabel: { color: css("--ink-2"), interval: 0, rotate: cats.length > 6 ? 30 : 0, fontSize: 11, width: 110, overflow: "truncate" } },
      // 변화 막대가 보이도록 y축을 0이 아니라 확률 범위 근처에서 시작한다 (축 시작값을 부제에 표시)
      yAxis: { ...base().yAxis, min: yMin,
        axisLabel: { color: css("--muted"), formatter: "{value}%" } },
      series: [
        { type: "bar", stack: "w", data: invisible, itemStyle: { color: "transparent" }, tooltip: { show: false }, emphasis: { disabled: true } },
        { type: "bar", stack: "w", data: vis, barMaxWidth: 36, itemStyle: { borderRadius: 3 } },
      ],
    });
  }));

  // 부문별 추이
  charts.push(chart(document.getElementById("sector-chart"), () => {
    const s = C.horizons[key].series;
    const colors = seriesColors();
    const n = s.length;
    return base({
      grid: { left: 52, right: 20, top: 36, bottom: 70 },
      tooltip: { ...base().tooltip, valueFormatter: (v) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${num(Math.abs(v))}%p`) },
      yAxis: { ...base().yAxis, axisLabel: { color: css("--muted"), formatter: "{value}%p" } },
      dataZoom: [{ type: "slider", bottom: 8, height: 22, startValue: toDate(s[Math.max(0, n - 96)].date), endValue: toDate(s[n - 1].date),
        borderColor: css("--border"), textStyle: { color: css("--muted") } }, { type: "inside" }],
      series: C.sectors.map((sec, i) => ({
        name: sec, type: "bar", stack: "sector", barCategoryGap: "15%",
        itemStyle: { color: colors[i % colors.length] },
        data: s.map((r) => [toDate(r.date), r.sector_pp[sec] * 100]),
      })),
    });
  }));

  texts(); tables();
  tabs(document.getElementById("tabs"), meta.horizons.map((h) => ({ key: h.key, label: h.label })), key, (k) => {
    key = k; texts(); tables(); charts.forEach((c) => c.render());
  });
}).catch(fail);
