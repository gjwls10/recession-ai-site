// 공통: 레이아웃, 테마, 데이터 로드, 서식, 차트 도우미
/* global echarts */

export const PAGES = [
  { id: "index", href: "index.html", label: "대시보드" },
  { id: "drivers", href: "drivers.html", label: "원인 분석" },
  { id: "severity", href: "severity.html", label: "침체 강도" },
  { id: "indicators", href: "indicators.html", label: "지표 상세" },
  { id: "about", href: "about.html", label: "방법론" },
  // 부스 게임 (final/open_site.py 가 booth/ 폴더로 복사)
  { id: "invest", href: "booth/invest_challenge.html", label: "📈 투자 챌린지" },
  { id: "tarot", href: "booth/tarot.html", label: "🔮 타로" },
];
export const DISCLAIMER = "통계 모델에 의한 추정치이며 투자 판단의 근거가 아닙니다.";
export const BAND_ICON = { 낮음: "✓", 주의: "!", 경계: "!!", 높음: "▲" };

// ─── 테마 ──────────────────────────────────────────────────
const THEME_KEY = "recession-theme";
const THEME_LABEL = { system: "테마: 시스템", light: "테마: 라이트", dark: "테마: 다크" };
function storedTheme() {
  try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; }
}
function applyTheme(mode) {
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* 저장 불가 환경 */ }
  window.dispatchEvent(new Event("themechange"));
}
applyTheme(storedTheme());
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => window.dispatchEvent(new Event("themechange")));

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const seriesColors = () => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"].map(css);

// ─── 레이아웃 ──────────────────────────────────────────────
export function shell(pageId) {
  const header = document.querySelector("header.site");
  header.innerHTML = `<div class="wrap">
    <a class="brand" href="index.html">경기침체 확률</a>
    <nav class="pages" aria-label="페이지">${PAGES.map((p) =>
      `<a href="${p.href}"${p.id === pageId ? ' aria-current="page"' : ""}>${p.label}</a>`).join("")}</nav>
    <button class="theme-toggle" type="button"></button></div>`;
  const btn = header.querySelector(".theme-toggle");
  const order = ["system", "light", "dark"];
  const label = () => { btn.textContent = THEME_LABEL[storedTheme()]; };
  label();
  btn.addEventListener("click", () => { applyTheme(order[(order.indexOf(storedTheme()) + 1) % 3]); label(); });
  document.querySelector("footer.site").innerHTML =
    `<div class="wrap">${DISCLAIMER} 데이터: 한국은행 ECOS, 통계청 KOSIS. <span id="generated"></span></div>`;
}

// ─── 데이터 ────────────────────────────────────────────────
const cache = {};
// ?snapshot: 헤드리스 스크린샷 확인용. 동기 요청으로 읽어 load 이벤트 전에 그리기를 끝낸다.
const SNAPSHOT = new URLSearchParams(location.search).has("snapshot");
window.addEventListener("error", (e) => fail(e.error || new Error(e.message)));
export function load(name) {
  if (SNAPSHOT && !cache[name]) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `data/${name}.json`, false);
    xhr.send();
    const data = JSON.parse(xhr.responseText);
    cache[name] = { then: (f) => { try { return Promise.resolve(f(data)); } catch (e) { return Promise.reject(e); } } };
  }
  if (!cache[name]) {
    cache[name] = fetch(`data/${name}.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${name}.json을 불러오지 못했습니다 (${r.status})`);
      return r.json();
    });
  }
  return cache[name];
}
export function loadAll(names) {
  if (SNAPSHOT) {
    // 동기 경로: then 콜백을 즉시 실행하고, 오류는 catch로 넘긴다
    const data = {};
    names.forEach((n) => load(n).then((v) => { data[n] = v; }));
    return { then(f) { try { f(data); } catch (e) { fail(e); } return { catch() {} }; } };
  }
  return Promise.all(names.map(load)).then((values) => Object.fromEntries(names.map((n, i) => [n, values[i]])));
}
export function fail(err) {
  const main = document.querySelector("main");
  main.insertAdjacentHTML("afterbegin", `<p class="notice error">데이터를 불러오지 못했습니다: ${err.message}.
    사이트 폴더에서 로컬 서버로 열었는지 확인하세요 (예: <code>uv run python -m http.server -d final/site</code>).</p>`);
  console.error(err);
}

// ─── 서식 ──────────────────────────────────────────────────
const nf1 = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const num = (x, d = 1) => (x == null || Number.isNaN(x) ? "–"
  : new Intl.NumberFormat("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(x) < 0.5 * 10 ** -d ? 0 : x));
export const pct = (p) => (p == null ? "–" : `${nf1.format(p * 100)}%`);
// 반올림해서 0이 되는 값은 부호 없이 ±0으로 쓴다 ("−0.0" 방지)
const sign = (x, d) => (Math.abs(x) < 0.5 * 10 ** -d ? "±" : x > 0 ? "+" : "−");
export const pp = (x) => (x == null ? "–" : `${sign(x * 100, 1)}${nf1.format(Math.abs(x * 100) < 0.05 ? 0 : Math.abs(x * 100))}%p`);
export const signed = (x, unit = "", d = 1) => (x == null ? "–" : `${sign(x, d)}${num(Math.abs(x), d)}${unit}`);
export const ymLabel = (ym) => (ym ? `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월` : "–");
export const toDate = (ym) => `${ym}-01`;
export function addMonths(ym, h) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + h;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function bandOf(p, thresholds) {
  let name = thresholds[0].band;
  for (const t of thresholds) if (p >= t.min) name = t.band;
  return name;
}
export function bandChip(name) {
  return `<span class="band" data-band="${name}"><span class="icon" aria-hidden="true">${BAND_ICON[name] || ""}</span>${name}</span>`;
}
export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ─── 차트 ──────────────────────────────────────────────────
const charts = [];
export function chart(el, build) {
  const entry = { el, build, inst: null };
  const render = () => {
    if (entry.inst) entry.inst.dispose();
    entry.inst = echarts.init(el, null, { renderer: "svg" });
    entry.inst.setOption(build());
  };
  entry.render = render;
  render();
  charts.push(entry);
  return entry;
}
window.addEventListener("themechange", () => charts.forEach((c) => c.render()));
window.addEventListener("resize", () => charts.forEach((c) => c.inst && c.inst.resize()));

export function base(extra = {}) {
  const ink = css("--ink"), ink2 = css("--ink-2"), grid = css("--grid"), axis = css("--axis"), surface = css("--surface");
  return {
    animation: false,
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: ink2 },
    grid: { left: 52, right: 20, top: 36, bottom: 40, containLabel: false },
    tooltip: {
      trigger: "axis", backgroundColor: surface, borderColor: css("--border"), textStyle: { color: ink, fontSize: 12.5 },
      axisPointer: { type: "line", lineStyle: { color: axis } },
    },
    legend: { top: 0, left: 0, textStyle: { color: ink2, fontSize: 12 }, itemWidth: 16, itemHeight: 8, icon: "roundRect" },
    xAxis: { type: "time", axisLine: { lineStyle: { color: axis } }, axisTick: { show: false },
      axisLabel: { color: css("--muted"), hideOverlap: true }, splitLine: { show: false } },
    yAxis: { type: "value", axisLine: { show: false }, axisLabel: { color: css("--muted") },
      splitLine: { lineStyle: { color: grid, width: 1 } } },
    ...extra,
  };
}

// 음영 영역용 빈 계열: 범례로 켜고 끌 수 있다
export function areaSeries(name, ranges, color, { opacity = 1 } = {}) {
  return {
    name, type: "line", data: [], symbol: "none", lineStyle: { opacity: 0 }, itemStyle: { color },
    tooltip: { show: false },
    markArea: { silent: true, itemStyle: { color, opacity }, data: ranges.map(([a, b]) => [{ xAxis: toDate(a) }, { xAxis: toDate(b) }]) },
  };
}
export const episodeRanges = (episodes) => episodes.map((e) => [e.start, addMonths(e.end, 1)]);
export const officialRanges = (cycles) => cycles.map((c) => [addMonths(c.peak, 1), addMonths(c.trough, 1)]);

// ─── 표 보기 ───────────────────────────────────────────────
export function tableToggle(container, columns, rows, summary = "데이터 표 보기") {
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((v) => `<td>${v == null ? "–" : esc(v)}</td>`).join("")}</tr>`).join("");
  container.insertAdjacentHTML("beforeend", `<details class="table"><summary>${summary}</summary>
    <div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></details>`);
}

export function tabs(container, items, selected, onChange) {
  container.classList.add("tabs");
  container.setAttribute("role", "tablist");
  container.innerHTML = items.map((it) =>
    `<button type="button" role="tab" data-key="${it.key}" aria-selected="${it.key === selected}">${esc(it.label)}</button>`).join("");
  container.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-key]");
    if (!b) return;
    container.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    onChange(b.dataset.key);
  });
}

export function showWarnings(el, warnings) {
  if (!warnings || !warnings.length) { el.hidden = true; return; }
  el.innerHTML = `<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`;
  el.hidden = false;
}
