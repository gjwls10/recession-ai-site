import {
  areaSeries, base, chart, css, episodeRanges, esc, fail, loadAll, num, officialRanges, pp, shell, signed, tableToggle, tabs, toDate, ymLabel,
} from "./common.js";

shell("indicators");

const TARGET_ID = "leading_index";
const ROLE = { feature: "입력 지표", target: "학습 타깃", reference: "참고 지표 (학습 미사용)" };

loadAll(["meta", "indicators", "target", "cycles"]).then(({ meta, indicators: items, target, cycles }) => {
  document.getElementById("generated").textContent = `생성: ${meta.generated_at.replace("T", " ")}`;
  const pick = document.getElementById("pick");
  const groups = ["feature", "target", "reference"];
  pick.innerHTML = groups.map((g) => `<optgroup label="${ROLE[g]}">${items.filter((i) => i.role === g)
    .map((i) => `<option value="${i.id}">${esc(i.short)}</option>`).join("")}</optgroup>`).join("");
  const params = new URLSearchParams(location.search);
  let item = items.find((i) => i.id === params.get("id")) || items[0];
  pick.value = item.id;
  let mode = "transformed";
  let horizon = "nowcast";

  const unitOf = (it, m) => (m === "raw" ? it.unit : it.transformed_unit || it.unit);
  const kindOf = (it) => (it.transform === "yoy" ? (it.id === "gdp_real" ? "전년동기비" : "전년동월비") : "값");

  function render() {
    const s = item.stats, u = item.transformed_unit;
    document.getElementById("title").textContent = item.label;
    document.getElementById("meta-line").textContent =
      `${ROLE[item.role]}${item.sector ? ` · 부문 ${item.sector}` : ""} · 공표시차 ${item.release_lag_months}개월` +
      (item.model_features.length ? ` · 모델 피처: ${item.model_features.map((f) => f.label).join(", ")}` : "") +
      (item.overlaps_target ? " · 선행종합지수 구성 재료와 겹침" : "");
    document.getElementById("text").textContent = item.text;

    const changeUnit = u === "%" ? "%p" : u;
    document.getElementById("tiles").innerHTML = [
      [`현재 (${kindOf(item)})`, `${num(s.current)}${u}`, ymLabel(s.latest_date)],
      [item.id === "gdp_real" ? "직전 분기 대비" : "전월 대비", signed(s.change_1, changeUnit),
        s.change_12 == null ? "" : `1년 전 대비 ${signed(s.change_12, changeUnit)}`],
      ["과거 분포 내 위치", `${num(s.percentile, 0)} 백분위`, `${s.history_start.slice(0, 4)}년 이후 (0=최저, 100=최고)`],
      ["하강 신호 구간 평균", `${num(s.recession_mean)}${u}`, `그 밖의 기간 평균 ${num(s.normal_mean)}${u}`],
    ].concat(s.lead_months == null ? [] : [["타깃과 가장 잘 맞는 시차", `${s.lead_months}개월 앞`, `상관 ${num(s.lead_corr, 2)}`]])
      .map(([k, v, n]) => `<div class="card"><div class="stat-label">${k}</div><div class="stat-value" style="font-size:22px">${esc(v)}</div>
        <div class="stat-note">${esc(n)}</div></div>`).join("");

    seriesChart.render();
    const st = document.getElementById("series-table");
    st.innerHTML = "";
    tableToggle(st, ["월", `원값 (${item.unit})`, `${kindOf(item)} (${unitOf(item, "transformed")})`],
      item.series.slice().reverse().map((r) => [r[0], num(r[1]), num(r[2])]));

    const card = document.getElementById("contrib-card");
    const has = Object.keys(item.contribution).length > 0;
    card.hidden = !has;
    if (has) {
      document.getElementById("contrib-sub").textContent =
        "평균 상태에서 이 지표의 피처만 해당 월 값으로 바꿨을 때의 확률 차이(%p, 근사)입니다. 위는 확률을 높인 달, 아래는 낮춘 달입니다.";
      contribChart.render();
      const ct = document.getElementById("contrib-table");
      ct.innerHTML = "";
      tableToggle(ct, ["예측 시점", "기여(%p)"], item.contribution[horizon].series.slice().reverse().map((r) => [r[0], pp(r[1])]));
    }
  }

  const seriesChart = chart(document.getElementById("series-chart"), () => {
    const idx = mode === "raw" ? 1 : 2;
    const unit = unitOf(item, mode);
    const data = item.series.filter((r) => r[idx] != null).map((r) => [toDate(r[0]), r[idx]]);
    return base({
      tooltip: { ...base().tooltip, valueFormatter: (v) => (v == null ? "–" : `${num(v)}${unit}`) },
      yAxis: { ...base().yAxis, scale: true, axisLabel: { color: css("--muted"), formatter: (v) => `${v}${unit}` } },
      series: [
        areaSeries("하강 신호 구간", episodeRanges(target.episodes), css("--episode")),
        areaSeries("공식 수축 국면", officialRanges(cycles), css("--official")),
        { name: item.short, type: "line", showSymbol: item.id === "gdp_real", symbolSize: 4, data,
          lineStyle: { width: 1.8, color: css("--s1") }, itemStyle: { color: css("--s1") },
          ...(item.id === TARGET_ID ? { markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ink-2"), type: "dashed" },
            label: { formatter: `기준선 ${target.threshold}%`, position: "insideEndTop", color: css("--ink-2") }, data: mode === "raw" ? [] : [{ yAxis: target.threshold }] } } : {}),
          ...(item.role === "reference" && mode !== "raw" ? { markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ink-2"), type: "dashed" },
            label: { formatter: "50", position: "insideEndTop", color: css("--ink-2") }, data: [{ yAxis: 50 }] } } : {}) },
      ],
    });
  });

  const contribChart = chart(document.getElementById("contrib-chart"), () => {
    const c = item.contribution[horizon];
    if (!c) return {};
    return base({
      legend: { show: false }, grid: { left: 52, right: 16, top: 16, bottom: 30 },
      tooltip: { ...base().tooltip, valueFormatter: (v) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v))}%p` },
      yAxis: { ...base().yAxis, axisLabel: { color: css("--muted"), formatter: "{value}%p" } },
      series: [{ type: "bar", name: "기여도", barCategoryGap: "10%",
        data: c.series.map((r) => ({ value: [toDate(r[0]), r[1] * 100], itemStyle: { color: r[1] >= 0 ? css("--up") : css("--down") } })) }],
    });
  });
  tabs(document.getElementById("mode-tabs"), [{ key: "transformed", label: "변환값" }, { key: "raw", label: "원값" }], mode, (k) => {
    mode = k; seriesChart.render();
  });
  tabs(document.getElementById("contrib-tabs"), meta.horizons.map((h) => ({ key: h.key, label: h.label })), horizon, (k) => {
    horizon = k; render();
  });
  pick.addEventListener("change", () => {
    item = items.find((i) => i.id === pick.value);
    history.replaceState(null, "", `?id=${item.id}`);
    render();
  });
  render();
}).catch(fail);
