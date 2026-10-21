import { base, chart, css, esc, fail, loadAll, num, shell, tableToggle, tabs, ymLabel } from "./common.js";

shell("about");

const MODEL_NAME = {
  main: "주 모델 (로지스틱 + 신호 회귀)", main_reselected: "주 모델, 피처 재선별 검증", main_without_overlap: "구성지표 겹침 피처 제외", gbm: "그래디언트 부스팅 (비교용)",
  term_spread: "장단기금리차 단일 (기준선)", base_rate: "기저율 (기준선)",
};

loadAll(["meta", "model", "indicators", "target"]).then(({ meta, model, indicators, target }) => {
  document.getElementById("generated").textContent = `생성: ${meta.generated_at.replace("T", " ")}`;
  const H = meta.horizons;
  const td = meta.target_definition;

  document.getElementById("target").innerHTML = `<h2>무엇을 예측하나</h2>
    <p><strong>학습 타깃은 통계청 선행종합지수</strong>입니다. 원지수는 장기 추세 때문에 거의 늘 오르므로, 추세를 뺀 신호로
    <em>원지수 전년동월비</em>를 씁니다. ${esc(td.description)}.</p>
    <p>선행지수는 실물 경기보다 몇 개월 앞서 움직이는 지표라서, 이 사이트의 확률은 "경기가 꺾이는 신호가 나타날 확률"에 가깝습니다.
    통계청 공식 기준순환일(경기 정점·저점)은 학습에 쓰지 않고 그래프의 참고 음영으로만 표시합니다. 2003~2025년 하강 신호 구간은 ${target.episodes.length}개이고,
    공식 수축 국면과 월별로 약 69% 일치합니다.</p>
    <p>생산확산지수(광공업·서비스업)는 학습에 쓰지 않는 <strong>참고 지표</strong>로, 하강이 실물로 얼마나 넓게 번졌는지 확인하는 데 씁니다.</p>`;

  const roleName = { feature: "입력", target: "타깃", reference: "참고" };
  document.getElementById("data-table").innerHTML = `<thead><tr><th>지표</th><th>역할</th><th>변환</th><th>공표시차</th><th>최신</th><th>출처</th></tr></thead><tbody>` +
    indicators.map((i) => `<tr><td>${esc(i.label)}</td><td>${roleName[i.role]}</td><td>${i.transform === "yoy" ? "전년동기비" : "수준"}</td>
      <td>${i.release_lag_months}개월</td><td>${ymLabel(meta.data_asof[i.id])}</td>
      <td>${["leading_index", "diffusion_mining_mfg", "diffusion_services"].includes(i.id) ? "통계청 KOSIS (수동)" : "한국은행 ECOS"}</td></tr>`).join("") + "</tbody>";

  document.getElementById("model-desc").innerHTML = `<h2>모델</h2>
    <p>예측 기간마다(현재·3·6·12개월 후) 모델이 하나씩, 모두 4개입니다. 각 모델은 두 선형 모델을 로그오즈에서 반씩 섞은 것입니다.
    (1) 하강 신호 여부(0/1)를 직접 맞히는 <strong>L2 정규화 로지스틱 회귀</strong>, (2) 선행종합지수 전년동월비 값 자체를 맞히는
    <strong>Ridge 회귀</strong>로, 예측값이 기준선 ${num(td.threshold)}%보다 얼마나 낮은지를 확률로 바꿉니다. (2)는 하강의 깊이까지 학습에 쓰기 때문에
    하강 구간이 적은(약 ${target.episodes.length}개) 상황에서 특히 먼 예측 기간에 도움이 됩니다. 둘 다 선형이라 합친 모델도 선형이고, 기여도를 정확히 나눌 수 있습니다.</p>
    <p>피처는 예측 기간마다 따로 골랐고, 전체 ${model.features.length}개입니다: ${model.features.map((f) => esc(f.label)).join(", ")}.
    지표 6종 × 변환 6종 후보 가운데, 그 기간 뒤의 타깃 신호와 상관이 높은 순으로 지표당 최대 2개, 다중공선성(VIF) 5 미만, 최대 10개 규칙을 따릅니다.
    아래 계수 표에서 "–"는 그 기간 모델에 쓰지 않은 피처입니다.</p>
    <p>각 피처는 <strong>예측 시점에 실제로 공표되어 있던 값</strong>만 씁니다(지표별 공표시차 적용). 학습 표본 ${model.sample.start} ~ ${model.sample.end},
    타깃은 ${ymLabel(model.label_cutoff)}까지 공표되어 있습니다.</p>`;

  // 성능 표
  const names = Object.keys(model.horizons.nowcast.metrics);
  const ordered = ["main", "main_reselected", "main_without_overlap", "gbm", "term_spread", "base_rate"].filter((n) => names.includes(n));
  document.getElementById("metrics").innerHTML = `<thead><tr><th>모델</th>${H.map((h) => `<th>${h.label} AUC</th><th>Brier</th>`).join("")}</tr></thead><tbody>` +
    ordered.map((n) => `<tr><td>${MODEL_NAME[n]}</td>${H.map((h) => {
      const m = model.horizons[h.key].metrics[n];
      const fails = n === "main" && m.auc < 0.7;
      return `<td>${num(m.auc, 3)}${fails ? " ⚠" : ""}</td><td>${num(m.brier, 3)}</td>`;
    }).join("")}</tr>`).join("") + "</tbody>";

  // 보정 곡선
  let key = "nowcast";
  const calChart = chart(document.getElementById("calib-chart"), () => {
    const c = model.horizons[key].calibration;
    return base({
      grid: { left: 52, right: 20, top: 30, bottom: 44 }, legend: { show: false },
      tooltip: { ...base().tooltip, trigger: "item", formatter: (p) =>
        `예측 평균 ${num(p.value[0] * 100)}%<br>실제 비율 ${num(p.value[1] * 100)}%<br>표본 ${p.value[2]}개월` },
      xAxis: { type: "value", min: 0, max: 1, name: "예측 확률", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: css("--muted") },
        axisLabel: { color: css("--muted"), formatter: (v) => `${v * 100}%` }, splitLine: { lineStyle: { color: css("--grid") } } },
      yAxis: { type: "value", min: 0, max: 1, axisLabel: { color: css("--muted"), formatter: (v) => `${v * 100}%` },
        splitLine: { lineStyle: { color: css("--grid") } } },
      series: [
        { type: "line", data: [[0, 0], [1, 1]], symbol: "none", lineStyle: { color: css("--axis"), type: "dashed" }, tooltip: { show: false }, silent: true },
        { type: "line", data: c.map((b) => [b.mean_p, b.rate, b.n]), symbolSize: (v) => Math.max(8, Math.sqrt(v[2]) * 2.2),
          lineStyle: { color: css("--s1"), width: 2 }, itemStyle: { color: css("--s1"), borderColor: css("--surface"), borderWidth: 2 } },
      ],
    });
  });
  const calTable = document.getElementById("calib-table");
  const drawCal = () => {
    calTable.innerHTML = "";
    tableToggle(calTable, ["확률 구간", "예측 평균", "실제 비율", "표본"],
      model.horizons[key].calibration.map((b) => [b.bin, `${num(b.mean_p * 100)}%`, `${num(b.rate * 100)}%`, b.n]));
  };
  drawCal();
  tabs(document.getElementById("calib-tabs"), H.map((h) => ({ key: h.key, label: h.label })), key, (k) => { key = k; calChart.render(); drawCal(); });

  // 계수
  document.getElementById("coefs").innerHTML = `<thead><tr><th>피처</th>${H.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead><tbody>` +
    model.features.map((f) => `<tr><td>${esc(f.label)}</td>${H.map((h) => {
      const x = model.horizons[h.key].coefficients.find((x) => x.id === f.id);
      if (!x || x.used === false) return "<td>–</td>";
      return `<td>${x.coef >= 0 ? "+" : "−"}${num(Math.abs(x.coef), 2)}</td>`;
    }).join("")}</tr>`).join("") + "</tbody>";

  // 구간 제외 검증 + 선행 개월
  const eps = model.horizons.nowcast.episode_holdout.episodes.map((e) => e.episode);
  document.getElementById("holdout").innerHTML = `<thead><tr><th>하강 구간</th>${H.map((h) => `<th>${h.label} 안/밖 평균</th><th>선행</th>`).join("")}</tr></thead><tbody>` +
    eps.map((ep) => `<tr><td>${ep}</td>${H.map((h) => {
      const hz = model.horizons[h.key];
      const e = hz.episode_holdout.episodes.find((x) => x.episode === ep);
      const lead = hz.lead_times.find((x) => ep.startsWith(x.episode));
      return `<td>${e ? `${num(e.mean_p_inside * 100, 0)}% / ${num((e.mean_p_outside ?? 0) * 100, 0)}%` : "–"}</td>
        <td>${lead && lead.lead_months != null ? `${lead.lead_months}개월` : "–"}</td>`;
    }).join("")}</tr>`).join("") +
    `<tr><td><strong>전체 AUC</strong></td>${H.map((h) => `<td>${num(model.horizons[h.key].episode_holdout.auc_pooled, 3)}</td><td></td>`).join("")}</tr></tbody>`;

  document.getElementById("limits").innerHTML = `<h2>한계와 주의</h2><ul>
    <li><strong>유사 실시간</strong>: 공표 당시의 속보치가 아니라 이후 개정된 값으로 학습했습니다. 특히 선행종합지수는 매월 과거 값까지 다시 계산되므로 실제 운용 성능은 위 표보다 낮을 수 있습니다.</li>
    ${H.filter((h) => model.horizons[h.key].metrics.main.auc < 0.7).map((h) => `<li><strong>${h.label} 예측</strong>은 검증 AUC가 기준(0.70)에 못 미쳐 참고용입니다.</li>`).join("")}
    <li><strong>2018-10 ~ 2019-09 하강 구간</strong>은 어느 예측 기간에서도 거의 잡아내지 못했습니다(구간 제외 검증에서 구간 안 평균 확률 2~5%).</li>
    <li><strong>구성지표 겹침</strong>: 장단기금리차와 BSI는 선행종합지수를 만드는 재료와 겹칩니다. 다만 이 둘을 뺀 모델도 AUC가 비슷해 성능이 크게 부풀려지지는 않은 것으로 보입니다.</li>
    <li><strong>피처 선별</strong>: 최종 피처는 전체 기간으로 골랐습니다. 그래서 매년 그 시점까지의 데이터로만 피처를 다시 고르는 "재선별 검증"도 함께 보여 줍니다. 이 값이 더 보수적인 성능입니다.</li>
    <li><strong>확률 보정</strong>: 표본이 적어 별도 보정(Platt scaling)은 적용하지 않았습니다. 위 보정 곡선으로 확인할 수 있습니다.</li>
    <li><strong>타깃 수동 갱신</strong>: 선행종합지수·생산확산지수는 KOSIS에서 직접 받아야 하며, 현재 파일은 ${ymLabel(meta.target_asof)}까지입니다.</li>
  </ul><p>통계 모델에 의한 추정치이며 투자 판단의 근거가 아닙니다.</p>`;
}).catch(fail);
