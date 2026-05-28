const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Fa = require("react-icons/fa");

// ---- palette (from project tailwind) ----
const C = {
  forest: "093520",   // brand-900 deep
  forest2: "0E4F30",  // brand-800
  green: "21A663",    // brand-500
  greenL: "66D9A7",   // brand-300
  gold: "F5B800",     // warm-400
  goldD: "B07800",    // warm-600
  blue: "2741E0",     // accent-500
  ink: "14160F",      // neutral-900
  muted: "717670",    // neutral-500
  line: "E4E6E1",     // neutral-200
  bg: "F8F9F7",       // neutral-50
  card: "FFFFFF",
  white: "FFFFFF",
};
const HEAD = "Georgia";
const BODY = "Calibri";

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color, size: String(size) })
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}
const sh = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.12 });

(async () => {
  const p = new pptxgen();
  p.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
  p.author = "Planwise team";
  p.title = "Planwise — Классный час";
  const W = 13.3, H = 7.5;

  // preload icons
  const I = {
    bolt: await icon(Fa.FaBolt, "#" + C.gold),
    clock: await icon(Fa.FaRegClock, "#" + C.green),
    shield: await icon(Fa.FaShieldAlt, "#" + C.green),
    book: await icon(Fa.FaBookOpen, "#" + C.green),
    users: await icon(Fa.FaUsers, "#" + C.green),
    calendar: await icon(Fa.FaRegCalendarAlt, "#" + C.green),
    edit: await icon(Fa.FaEdit, "#" + C.green),
    file: await icon(Fa.FaFileExport, "#" + C.green),
    brain: await icon(Fa.FaProjectDiagram, "#" + C.green),
    server: await icon(Fa.FaServer, "#" + C.green),
    network: await icon(Fa.FaShareAlt, "#" + C.green),
    chart: await icon(Fa.FaChartLine, "#" + C.green),
    warn: await icon(Fa.FaExclamationTriangle, "#" + C.gold),
    check: await icon(Fa.FaCheckCircle, "#" + C.green),
    cross: await icon(Fa.FaTimesCircle, "#" + C.muted),
    rocket: await icon(Fa.FaRocket, "#" + C.gold),
    seedling: await icon(Fa.FaSeedling, "#" + C.greenL),
  };

  // ===== helpers =====
  function kicker(s, txt, x = 0.7) {
    s.addShape(p.shapes.RECTANGLE, { x, y: 0.62, w: 0.34, h: 0.34, fill: { color: C.gold } });
    s.addText(txt, { x: x + 0.46, y: 0.5, w: 9, h: 0.55, fontFace: BODY, fontSize: 13, bold: true, color: C.green, charSpacing: 2, valign: "middle" });
  }
  function title(s, txt, x = 0.7) {
    s.addText(txt, { x, y: 0.95, w: 11.9, h: 0.95, fontFace: HEAD, fontSize: 32, bold: true, color: C.ink, valign: "middle" });
  }
  function pageBg(s) { s.background = { color: C.bg }; }

  // circle icon badge
  function badge(s, x, y, d, iconData, fill = C.forest) {
    s.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill } });
    const pad = d * 0.26;
    s.addImage({ data: iconData, x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
  }

  // ============================================================
  // SLIDE 1 — TITLE
  // ============================================================
  let s = p.addSlide();
  s.background = { color: C.forest };
  s.addShape(p.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.18, fill: { color: C.gold } });
  // soft decorative circles
  s.addShape(p.shapes.OVAL, { x: 10.6, y: -1.6, w: 4.2, h: 4.2, fill: { color: C.forest2 } });
  s.addShape(p.shapes.OVAL, { x: 11.8, y: 4.4, w: 3.4, h: 3.4, fill: { color: C.forest2 } });

  s.addText("PLANWISE", { x: 0.9, y: 1.55, w: 8, h: 0.5, fontFace: BODY, fontSize: 15, bold: true, color: C.greenL, charSpacing: 6 });
  s.addText("«Классный час»", { x: 0.85, y: 2.0, w: 11, h: 1.5, fontFace: HEAD, fontSize: 58, bold: true, color: C.white });
  s.addText("ИИ-генератор сценариев внеурочных занятий", { x: 0.9, y: 3.5, w: 11, h: 0.6, fontFace: BODY, fontSize: 22, color: C.greenL });

  s.addText([
    { text: "Готовый методический сценарий за ", options: { color: C.white } },
    { text: "2 минуты", options: { color: C.gold, bold: true } },
    { text: " вместо ", options: { color: C.white } },
    { text: "2 часов", options: { color: C.gold, bold: true } },
    { text: " ручной подготовки", options: { color: C.white } },
  ], { x: 0.9, y: 4.45, w: 11.4, h: 0.6, fontFace: BODY, fontSize: 20 });

  s.addText("На базе GigaChat • опора на методички «Разговоры о важном» • защита персональных данных детей", {
    x: 0.9, y: 5.7, w: 11.4, h: 0.5, fontFace: BODY, fontSize: 14, color: C.greenL,
  });
  s.addText([
    { text: "Кейс 5 • Хакатон 2026 • живое демо: ", options: { color: "7FB79A" } },
    { text: "plan-wise.ru", options: { color: C.gold, bold: true, hyperlink: { url: "https://plan-wise.ru" } } },
    { text: "   •   код: ", options: { color: "7FB79A" } },
    { text: "github.com/Caspernik-dev/planwise", options: { color: C.gold, bold: true, hyperlink: { url: "https://github.com/Caspernik-dev/planwise" } } },
  ], { x: 0.9, y: 6.55, w: 11.9, h: 0.4, fontFace: BODY, fontSize: 13, italic: true });

  // ============================================================
  // SLIDE 2 — TEAM
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "02 — КОМАНДА");
  title(s, "Команда и зоны ответственности");

  const roles = [
    ["Product / Research", "Продуктовое исследование, интервью с классными руководителями, приоритизация сценариев", "delpdelv, reynalds"],
    ["Backend / LLM", "Интеграция с GigaChat, промпт-инжиниринг, стриминг генерации, серверная логика", "delpdelv, reynalds"],
    ["ML / RAG", "Парсинг «Разговоров о важном», эмбеддинги, гибридный поиск, библиотека сообщества", "reynalds"],
    ["Frontend / UX", "Кабинет педагога, блочный редактор, календарь, экспорт PDF/DOCX", "delpdelv"],
    ["DevOps / Security", "Развёртывание, изоляция данных, rate-limit, анонимизация ПДн", "delpdelv"],
  ];
  const colW = 3.86, gap = 0.28, x0 = 0.7, y0 = 2.2;
  roles.forEach((r, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = x0 + col * (colW + gap);
    const y = y0 + row * 2.35;
    s.addShape(p.shapes.RECTANGLE, { x, y, w: colW, h: 2.05, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    s.addShape(p.shapes.RECTANGLE, { x, y, w: 0.1, h: 2.05, fill: { color: C.green } });
    s.addText(r[0], { x: x + 0.3, y: y + 0.22, w: colW - 0.5, h: 0.5, fontFace: HEAD, fontSize: 17, bold: true, color: C.ink });
    s.addText(r[1], { x: x + 0.3, y: y + 0.78, w: colW - 0.5, h: 0.95, fontFace: BODY, fontSize: 13.5, color: C.muted, valign: "top" });
    s.addText(r[2], { x: x + 0.3, y: y + 1.62, w: colW - 0.6, h: 0.32, fontFace: BODY, fontSize: 13, bold: true, italic: true, color: C.green, align: "right" });
  });
  const cx = x0 + 2 * (colW + gap); // free right column (col 2, bottom)
  // research note (top of free column)
  s.addShape(p.shapes.RECTANGLE, { x: cx, y: y0 + 2.35, w: colW, h: 0.95, fill: { color: C.bg }, line: { color: C.green, width: 1.2 } });
  s.addText([
    { text: "Продуктовое исследование: ", options: { bold: true, color: C.green } },
    { text: "выявлены трудозатраты, типовые форматы и приоритетные сценарии.", options: { color: C.ink } },
  ], { x: cx + 0.22, y: y0 + 2.45, w: colW - 0.44, h: 0.78, fontFace: BODY, fontSize: 12, valign: "middle" });
  // team box (bottom of free column)
  s.addShape(p.shapes.RECTANGLE, { x: cx, y: y0 + 3.45, w: colW, h: 1.6, fill: { color: C.forest }, shadow: sh() });
  s.addText("Команда Planwise", { x: cx + 0.25, y: y0 + 3.6, w: colW - 0.5, h: 0.45, fontFace: HEAD, fontSize: 18, bold: true, color: C.gold });
  s.addText([
    { text: "Никита Феоктистов ", options: { color: C.white, bold: true } },
    { text: "(delpdelv)", options: { color: C.greenL } },
  ], { x: cx + 0.25, y: y0 + 4.12, w: colW - 0.5, h: 0.4, fontFace: BODY, fontSize: 13.5, valign: "middle" });
  s.addText([
    { text: "Данияр Хабибуллин ", options: { color: C.white, bold: true } },
    { text: "(reynalds)", options: { color: C.greenL } },
  ], { x: cx + 0.25, y: y0 + 4.55, w: colW - 0.5, h: 0.4, fontFace: BODY, fontSize: 13.5, valign: "middle" });

  // ============================================================
  // SLIDE 3 — PROBLEM & USERS
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "03 — ПРОБЛЕМА И ПОЛЬЗОВАТЕЛИ");
  title(s, "1–3 часа на каждый сценарий → выгорание");

  // left: persona / story
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 2.15, w: 6.0, h: 4.7, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
  badge(s, 0.95, 2.4, 0.7, I.users);
  s.addText("Кто пользователь", { x: 1.8, y: 2.45, w: 4.7, h: 0.6, fontFace: HEAD, fontSize: 18, bold: true, color: C.ink, valign: "middle" });
  s.addText([
    { text: "Классный руководитель", options: { bullet: true, bold: true, breakLine: true } },
    { text: "Советник по воспитанию", options: { bullet: true, bold: true, breakLine: true } },
    { text: "Педагог-организатор", options: { bullet: true, bold: true, breakLine: true } },
  ], { x: 1.1, y: 3.25, w: 5.3, h: 1.1, fontFace: BODY, fontSize: 15, color: C.ink, paraSpaceAfter: 4 });
  s.addShape(p.shapes.LINE, { x: 1.1, y: 4.55, w: 5.2, h: 0, line: { color: C.line, width: 1 } });
  s.addText("Сценарий столкновения с проблемой", { x: 1.1, y: 4.65, w: 5.3, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: C.green });
  s.addText("«Вечер воскресенья. Завтра классный час по патриотическому направлению для 7 класса. Методичек много, времени нет — нужен вовлекающий сценарий с хронометражем и вопросами, а не реферат».", {
    x: 1.1, y: 5.05, w: 5.3, h: 1.6, fontFace: BODY, fontSize: 14, italic: true, color: C.ink, valign: "top",
  });

  // right: stat callouts + pains
  s.addShape(p.shapes.RECTANGLE, { x: 6.95, y: 2.15, w: 5.65, h: 2.05, fill: { color: C.forest }, shadow: sh() });
  s.addText("1–3 ч", { x: 7.15, y: 2.3, w: 2.6, h: 1.0, fontFace: HEAD, fontSize: 46, bold: true, color: C.gold, valign: "middle" });
  s.addText("на подготовку одного сценария вручную", { x: 7.15, y: 3.25, w: 2.7, h: 0.8, fontFace: BODY, fontSize: 13, color: C.greenL, valign: "top" });
  s.addShape(p.shapes.LINE, { x: 9.95, y: 2.45, w: 0, h: 1.4, line: { color: C.forest2, width: 1.5 } });
  s.addText("30+", { x: 10.15, y: 2.3, w: 2.3, h: 1.0, fontFace: HEAD, fontSize: 46, bold: true, color: C.white, valign: "middle" });
  s.addText("занятий за четверть = десятки часов рутины", { x: 10.15, y: 3.25, w: 2.3, h: 0.8, fontFace: BODY, fontSize: 13, color: C.greenL, valign: "top" });

  const pains = [
    "Методички разрознены, единого источника нет",
    "Голый ChatGPT/GigaChat даёт «простыню» без хронометража и воспитательных результатов",
    "Нельзя загружать данные детей в чужой ИИ — риск утечки ПДн",
  ];
  s.addShape(p.shapes.RECTANGLE, { x: 6.95, y: 4.35, w: 5.65, h: 2.5, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
  s.addText("Что мешает сегодня", { x: 7.2, y: 4.5, w: 5.2, h: 0.5, fontFace: HEAD, fontSize: 17, bold: true, color: C.ink });
  s.addText(pains.map((t, i) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: i < pains.length - 1, color: C.ink } })),
    { x: 7.25, y: 5.05, w: 5.15, h: 1.7, fontFace: BODY, fontSize: 14, paraSpaceAfter: 8, valign: "top" });

  // ============================================================
  // SLIDE 4 — SOLUTION + comparison
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "04 — РЕШЕНИЕ");
  title(s, "Методический инструмент, а не обёртка над ИИ");

  // idea line + 3 ways to set topic
  s.addText([
    { text: "Задал контекст ", options: {} },
    { text: "(направление · класс · тема · формат · длительность)", options: { color: C.muted } },
    { text: "  →  ИИ собрал сценарий с опорой на методички  →  отредактировал  →  выгрузил в PDF/DOCX.", options: {} },
  ], { x: 0.7, y: 1.95, w: 11.9, h: 0.55, fontFace: BODY, fontSize: 15, bold: true, color: C.ink, valign: "middle" });

  const ways = [
    [I.edit, "Ручной ввод темы"],
    [I.file, "Загрузка плана школы — система сама предложит следующую незакрытую тему"],
    [I.calendar, "Календарь поводов или библиотека сообщества"],
  ];
  ways.forEach((wd, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.55, w: 3.8, h: 1.15, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    badge(s, x + 0.2, 2.72, 0.55, wd[0], C.green);
    s.addText(wd[1], { x: x + 0.95, y: 2.62, w: 2.75, h: 1.0, fontFace: BODY, fontSize: 12.5, color: C.ink, valign: "middle" });
  });

  // comparison table
  const tHead = (t) => ({ text: t, options: { fill: { color: C.forest }, color: C.white, bold: true, fontSize: 12.5, align: "center", valign: "middle" } });
  const yes = { text: "✓", options: { color: C.green, bold: true, align: "center", fontSize: 16 } };
  const no = { text: "—", options: { color: C.muted, align: "center", fontSize: 14 } };
  const rowL = (t) => ({ text: t, options: { color: C.ink, bold: true, fontSize: 12, valign: "middle" } });
  const data = [
    [tHead("Возможность"), tHead("Голый ChatGPT"), tHead("Методички PDF"), tHead("Planwise")],
    [rowL("Структура: этапы + хронометраж"), no, { text: "статично", options: { align: "center", color: C.muted, fontSize: 11 } }, yes],
    [rowL("Воспитательные результаты"), no, yes, yes],
    [rowL("Опора на «Разговоры о важном»"), no, { text: "ищи сам", options: { align: "center", color: C.muted, fontSize: 11 } }, { text: "✓ RAG авто", options: { color: C.green, bold: true, align: "center", fontSize: 12 } }],
    [rowL("Загрузка плана + следующая тема"), no, no, yes],
    [rowL("Свой материал как основа сценария"), no, { text: "вручную", options: { align: "center", color: C.muted, fontSize: 11 } }, yes],
    [rowL("Защита ПДн детей"), { text: "утекают", options: { align: "center", color: C.goldD, fontSize: 11 } }, no, yes],
    [rowL("Редактор + фирменный PDF / DOCX"), no, no, yes],
    [rowL("Библиотека сообщества + шаринг по ссылке"), no, no, yes],
  ];
  s.addTable(data, {
    x: 0.7, y: 3.95, w: 11.9, colW: [4.7, 2.4, 2.4, 2.4],
    rowH: 0.34, border: { type: "solid", pt: 0.5, color: C.line },
    fill: { color: C.card }, valign: "middle", margin: [2, 4, 2, 6],
  });

  // ============================================================
  // SLIDE 5 — TECH
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "05 — ТЕХНИЧЕСКАЯ РЕАЛИЗАЦИЯ");
  title(s, "Клиент ↔ сервер ↔ LLM ↔ БД");

  // architecture row of 3 boxes
  const arch = [
    [I.server, "Next.js 15 (монолит)", "App Router, Server Actions, Route Handlers, TypeScript"],
    [I.brain, "GigaChat (внешний API)", "chat + EmbeddingsGigaR (2560d). Локальные модели запрещены"],
    [I.book, "PostgreSQL 16 + pgvector", "сценарии · планы · календарь · RAG-корпус · лайки"],
  ];
  arch.forEach((a, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.1, w: 3.8, h: 1.55, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    badge(s, x + 0.22, 2.32, 0.6, a[0], C.forest);
    s.addText(a[1], { x: x + 1.0, y: 2.22, w: 2.7, h: 0.55, fontFace: HEAD, fontSize: 14.5, bold: true, color: C.ink, valign: "middle" });
    s.addText(a[2], { x: x + 0.25, y: 2.95, w: 3.35, h: 0.6, fontFace: BODY, fontSize: 12, color: C.muted, valign: "top" });
    if (i < 2) s.addText("↔", { x: x + 3.8, y: 2.1, w: 0.25, h: 1.55, align: "center", valign: "middle", fontSize: 22, bold: true, color: C.green });
  });

  // pipeline strip
  s.addText("Пайплайн генерации", { x: 0.7, y: 3.95, w: 6, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.ink });
  const steps = ["Форма", "Анонимизация ПДн", "Pre-match", "RAG-поиск", "Каркас + план", "Блоки ×N", "Гейт качества", "Сохранение"];
  const sx = 0.7, sy = 4.45, sw = 11.9, bw = (sw - (steps.length - 1) * 0.12) / steps.length;
  steps.forEach((t, i) => {
    const x = sx + i * (bw + 0.12);
    const hl = (i === 1 || i === 3 || i === 5);
    s.addShape(p.shapes.RECTANGLE, { x, y: sy, w: bw, h: 0.85, fill: { color: hl ? C.green : C.forest2 } });
    s.addText(`${i + 1}`, { x, y: sy + 0.06, w: bw, h: 0.3, align: "center", fontFace: HEAD, fontSize: 12, bold: true, color: C.gold });
    s.addText(t, { x: x + 0.04, y: sy + 0.32, w: bw - 0.08, h: 0.5, align: "center", valign: "middle", fontFace: BODY, fontSize: 10, color: C.white });
  });

  // 3 mandatory tech badges
  const tb = [
    [I.brain, "LLM + промпты", "По блокам: каркас+контент-план → блоки по очереди с катящимся контекстом → гейт качества → zod"],
    [I.file, "Парсинг TXT/PDF/DOCX/PPTX", "pdf-parse · mammoth · jszip в памяти, guard 5 МБ + проверка magic-bytes"],
    [I.shield, "Хранение + безопасность", "rate-limit 10 генераций/день · изоляция WHERE user_id на каждом запросе"],
  ];
  tb.forEach((a, i) => {
    const x = 0.7 + i * 4.05;
    const y = 5.7;
    s.addShape(p.shapes.RECTANGLE, { x, y, w: 3.8, h: 1.35, fill: { color: C.bg }, line: { color: C.green, width: 1.3 } });
    badge(s, x + 0.2, y + 0.22, 0.5, a[0], C.green);
    s.addText(a[1], { x: x + 0.85, y: y + 0.18, w: 2.8, h: 0.5, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.ink, valign: "middle" });
    s.addText(a[2], { x: x + 0.25, y: y + 0.72, w: 3.35, h: 0.55, fontFace: BODY, fontSize: 11, color: C.muted, valign: "top" });
  });

  // ============================================================
  // SLIDE 5b — ARCHITECTURE DIAGRAM
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "05 — АРХИТЕКТУРА (СХЕМА)");
  title(s, "Потоки данных: клиент ↔ сервер ↔ LLM ↔ БД");

  const flow = () => ({ color: C.green, width: 2, endArrowType: "triangle", beginArrowType: "triangle" });

  // CLIENT
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 3.05, w: 2.5, h: 1.6, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 3.05, w: 2.5, h: 0.1, fill: { color: C.green } });
  badge(s, 0.95, 3.3, 0.55, I.users, C.forest);
  s.addText("Браузер педагога", { x: 0.7, y: 3.95, w: 2.5, h: 0.4, align: "center", fontFace: HEAD, fontSize: 14, bold: true, color: C.ink });
  s.addText("форма · редактор · экспорт", { x: 0.7, y: 4.3, w: 2.5, h: 0.3, align: "center", fontFace: BODY, fontSize: 10.5, color: C.muted });

  // NEXT.JS SERVER (center)
  s.addShape(p.shapes.RECTANGLE, { x: 3.95, y: 2.15, w: 4.85, h: 4.35, fill: { color: C.forest }, shadow: sh() });
  s.addText("Next.js 15 — монолит (TypeScript)", { x: 3.95, y: 2.28, w: 4.85, h: 0.4, align: "center", fontFace: HEAD, fontSize: 15, bold: true, color: C.gold });
  const layers = [
    ["app/", "лендинг · auth · кабинет · календарь"],
    ["api/", "generate (SSE) · upload · likes · search · export"],
    ["lib/", "gigachat · parse · pii · rag · prompt · export"],
  ];
  layers.forEach((l, i) => {
    const y = 2.8 + i * 1.18;
    s.addShape(p.shapes.RECTANGLE, { x: 4.2, y, w: 4.35, h: 1.0, fill: { color: C.forest2 } });
    s.addShape(p.shapes.RECTANGLE, { x: 4.2, y, w: 0.09, h: 1.0, fill: { color: C.greenL } });
    s.addText(l[0], { x: 4.4, y: y + 0.12, w: 4.0, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.white });
    s.addText(l[1], { x: 4.4, y: y + 0.52, w: 4.0, h: 0.4, fontFace: BODY, fontSize: 11.5, color: C.greenL });
  });

  // GIGACHAT (right top)
  s.addShape(p.shapes.RECTANGLE, { x: 9.95, y: 2.4, w: 2.65, h: 1.55, fill: { color: C.card }, line: { color: C.green, width: 1.3 }, shadow: sh() });
  badge(s, 10.2, 2.62, 0.5, I.brain, C.green);
  s.addText("GigaChat API", { x: 10.85, y: 2.62, w: 1.7, h: 0.5, fontFace: HEAD, fontSize: 14, bold: true, color: C.ink, valign: "middle" });
  s.addText("chat + EmbeddingsGigaR (2560d) · внешний, локальных моделей нет", { x: 10.2, y: 3.2, w: 2.25, h: 0.7, fontFace: BODY, fontSize: 10.5, color: C.muted, valign: "top" });

  // POSTGRES (right bottom)
  s.addShape(p.shapes.RECTANGLE, { x: 9.95, y: 4.55, w: 2.65, h: 1.55, fill: { color: C.card }, line: { color: C.green, width: 1.3 }, shadow: sh() });
  badge(s, 10.2, 4.77, 0.5, I.book, C.green);
  s.addText("PostgreSQL 16", { x: 10.85, y: 4.77, w: 1.7, h: 0.5, fontFace: HEAD, fontSize: 14, bold: true, color: C.ink, valign: "middle" });
  s.addText("+ pgvector · сценарии · планы · календарь · RAG · лайки", { x: 10.2, y: 5.35, w: 2.25, h: 0.7, fontFace: BODY, fontSize: 10.5, color: C.muted, valign: "top" });

  // arrows + labels
  s.addShape(p.shapes.LINE, { x: 3.2, y: 3.85, w: 0.75, h: 0, line: flow() });
  s.addText("HTTPS / SSE", { x: 3.05, y: 3.45, w: 1.05, h: 0.3, align: "center", fontFace: BODY, fontSize: 9, bold: true, color: C.green });
  s.addShape(p.shapes.LINE, { x: 8.8, y: 3.15, w: 1.15, h: 0, line: flow() });
  s.addText("промпты / эмбеддинги", { x: 8.55, y: 2.78, w: 1.7, h: 0.3, align: "center", fontFace: BODY, fontSize: 8.5, bold: true, color: C.green });
  s.addShape(p.shapes.LINE, { x: 8.8, y: 5.3, w: 1.15, h: 0, line: flow() });
  s.addText("SQL (WHERE user_id)", { x: 8.55, y: 4.92, w: 1.7, h: 0.3, align: "center", fontFace: BODY, fontSize: 8.5, bold: true, color: C.green });

  // bottom guard note
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 6.7, w: 11.9, h: 0.55, fill: { color: C.bg }, line: { color: C.green, width: 1 } });
  s.addText([
    { text: "Защита: ", options: { bold: true, color: C.green } },
    { text: "PII-анонимизация ДО любого вызова GigaChat · rate-limit на пользователя · строгая изоляция данных по user_id · TLS-сертификаты Минцифры РФ", options: { color: C.ink } },
  ], { x: 0.95, y: 6.7, w: 11.5, h: 0.55, fontFace: BODY, fontSize: 11.5, valign: "middle" });

  // ============================================================
  // SLIDE 5c — GENERATION PIPELINE (per-block story)
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "05 — ПАЙПЛАЙН ГЕНЕРАЦИИ");
  title(s, "Как рождается сценарий: генерация по блокам");

  // insight banner
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 1.9, w: 11.9, h: 0.82, fill: { color: C.forest }, shadow: sh() });
  s.addText([
    { text: "Инсайт: ", options: { bold: true, color: C.gold } },
    { text: "LLM «насыщает» ~800 токенов за один вызов — один запрос даёт «простыню» ~5 КБ. ", options: { color: C.white } },
    { text: "Методичка «Разговоры о важном» = 9–11 плотных блоков. Значит генерируем ПО ОДНОМУ БЛОКУ за вызов — объём масштабируется числом блоков, а не «уговорами» модели.", options: { color: C.greenL } },
  ], { x: 0.95, y: 1.9, w: 11.4, h: 0.82, fontFace: BODY, fontSize: 12.5, valign: "middle" });

  // 4-step flow cards
  const gsteps = [
    [I.brain, "1 · Каркас + контент-план", "Цели, ценности, основные смыслы и список блоков {тип · фокус} по этапам. Смыслы заранее распределены — без повторов."],
    [I.network, "2 · Блоки по очереди (×N)", "Каждый блок — отдельный фокусный вызов с RAG-опорой. В следующий вызов передаём сводку готовых блоков — связность и преемственность хода."],
    [I.shield, "3 · Гейт качества (без ИИ)", "Проверка длины, многоходовости «Учитель: …», числа вопросов. Тонкий блок автоматически переписывается."],
    [I.check, "4 · Сборка и сохранение", "Соединение блоков → нормализация хронометража → zod-валидация → запись с изоляцией по user_id."],
  ];
  gsteps.forEach((g, i) => {
    const x = 0.7 + i * 3.05;
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.98, w: 2.85, h: 2.32, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.98, w: 2.85, h: 0.12, fill: { color: C.green } });
    badge(s, x + 0.2, 3.28, 0.55, g[0], C.forest);
    s.addText(g[1], { x: x + 0.85, y: 3.24, w: 1.9, h: 0.65, fontFace: HEAD, fontSize: 12.5, bold: true, color: C.ink, valign: "middle" });
    s.addText(g[2], { x: x + 0.25, y: 3.98, w: 2.4, h: 1.25, fontFace: BODY, fontSize: 11, color: C.muted, valign: "top" });
    if (i < gsteps.length - 1) s.addText("→", { x: x + 2.85, y: 3.95, w: 0.2, h: 0.4, align: "center", fontSize: 18, bold: true, color: C.green });
  });

  // result stat callouts (живой замер на GigaChat)
  const gres = [
    ["14,6 КБ", "объём сценария — ≈ в 3 раза больше прежнего (~5 КБ)"],
    ["РоВ-уровень", "многоходовой ход «Учитель: …» с конкретикой и вопросами"],
    ["~45 сек", "живой замер на GigaChat · 0 «тонких» блоков"],
  ];
  gres.forEach((r, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(p.shapes.RECTANGLE, { x, y: 5.55, w: 3.8, h: 1.4, fill: { color: C.bg }, line: { color: C.green, width: 1.3 } });
    s.addText(r[0], { x: x + 0.25, y: 5.62, w: 3.4, h: 0.65, fontFace: HEAD, fontSize: r[0] === "РоВ-уровень" ? 22 : 27, bold: true, color: C.green, valign: "middle" });
    s.addText(r[1], { x: x + 0.25, y: 6.28, w: 3.4, h: 0.6, fontFace: BODY, fontSize: 11.5, color: C.muted, valign: "top" });
  });

  // ============================================================
  // SLIDE 6 — MVP
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "06 — MVP");
  title(s, "Рабочая версия: полный путь без заглушек");

  // left: demo path — 2×2 grid of real screenshots
  s.addText("Демо-путь: контекст → стрим → редактор → экспорт", { x: 0.7, y: 2.05, w: 6, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.ink });
  const SHOTS = "/home/nikit/planwise/artifacts";
  const tiles = [
    { img: `${SHOTS}/1-form.png`, label: "1. Форма контекста" },
    { img: `${SHOTS}/2-stream.png`, label: "2. Стрим генерации по блокам" },
    { img: `${SHOTS}/5-editor-regen.png`, label: "3. Редактор: 🎲 · ↑↓ · add/del" },
    { img: `${SHOTS}/4-export.png`, label: "4. Экспорт PDF / DOCX" },
  ];
  const tileW = 2.75, tileH = 2.15, tileGap = 0.1;
  const imgH = 1.74, capH = tileH - imgH; // 1.74 + 0.41
  tiles.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.7 + col * (tileW + tileGap);
    const y = 2.55 + row * (tileH + tileGap);
    s.addShape(p.shapes.RECTANGLE, { x, y, w: tileW, h: tileH, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    s.addImage({ path: t.img, x: x + 0.08, y: y + 0.08, w: tileW - 0.16, h: imgH - 0.08, sizing: { type: "contain", w: tileW - 0.16, h: imgH - 0.08 } });
    s.addShape(p.shapes.RECTANGLE, { x, y: y + imgH, w: tileW, h: capH, fill: { color: C.forest2 } });
    s.addText(t.label, { x: x + 0.12, y: y + imgH, w: tileW - 0.24, h: capH, fontFace: BODY, fontSize: 11.5, bold: true, color: C.white, valign: "middle" });
  });

  // right: what works + resources + growth
  s.addShape(p.shapes.RECTANGLE, { x: 6.7, y: 2.05, w: 5.9, h: 2.85, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
  s.addText("Что уже работает", { x: 6.95, y: 2.2, w: 5.4, h: 0.45, fontFace: HEAD, fontSize: 16, bold: true, color: C.green });
  const works = [
    "Генерация по блокам РоВ-уровня во всех 8 форматах (классный час, квиз, дебаты, киноклуб, проектная сессия…)",
    "Загрузка плана и своего материала (PDF/DOCX/PPTX/TXT) как основы сценария",
    "Редактор: добавление/удаление и reorder этапов ↑/↓, точечная регенерация с выбором типа, история версий с откатом",
    "Полноэкранный режим показа на проекторе + календарь-сетка с привязкой к дате",
    "Библиотека сообщества + семантический поиск, оценка сценария 👍/👎",
    "Фирменный экспорт PDF (с QR) и DOCX · шаринг по ссылке · страница «Что нового»",
    "Админ-панель статистики",
  ];
  s.addText(works.map((t, i) => ({ text: t, options: { bullet: { code: "2713" }, breakLine: i < works.length - 1, color: C.ink } })),
    { x: 7.0, y: 2.7, w: 5.5, h: 2.1, fontFace: BODY, fontSize: 11.5, paraSpaceAfter: 4, valign: "top" });

  s.addShape(p.shapes.RECTANGLE, { x: 6.7, y: 5.05, w: 2.85, h: 1.95, fill: { color: C.forest }, shadow: sh() });
  s.addText("Ресурсы MVP", { x: 6.9, y: 5.2, w: 2.5, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.gold });
  s.addText([
    { text: "1 VPS · 2 vCPU / 4 ГБ", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "GigaChat API (PERS)", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Docker Compose", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Дёшево в эксплуатации", options: { bullet: { code: "2022" }, color: C.greenL } },
  ], { x: 6.95, y: 5.65, w: 2.55, h: 1.3, fontFace: BODY, fontSize: 12, color: C.white, paraSpaceAfter: 4, valign: "top" });

  s.addShape(p.shapes.RECTANGLE, { x: 9.75, y: 5.05, w: 2.85, h: 1.95, fill: { color: C.bg }, line: { color: C.green, width: 1.3 } });
  s.addText("Развитие", { x: 9.95, y: 5.2, w: 2.5, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.green });
  s.addText([
    { text: "Интеграция с эл. журналами", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Модерация контента методистами", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Мульти-школьные тенанты", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Аналитика вовлечённости", options: { bullet: { code: "2022" } } },
  ], { x: 10.0, y: 5.65, w: 2.55, h: 1.3, fontFace: BODY, fontSize: 11.5, color: C.ink, paraSpaceAfter: 3, valign: "top" });

  // ============================================================
  // SLIDE 7 — ROADMAP
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "07 — ДОРОЖНАЯ КАРТА");
  title(s, "От MVP к масштабу");

  const phases = [
    ["Развёрнуто на проде", C.green, ["MVP + RAG-корпус методичек РоВ · домен plan-wise.ru + HTTPS", "Docker Compose · библиотека наполнена · порог откалиброван"]],
    ["Перед демо", C.gold, ["Живой UAT golden-path", "Скринкаст 5–7 мин + презентация"]],
    ["Пилот в школе", C.blue, ["Обкатка с реальными классными руководителями", "Модерация контента методистами"]],
    ["Масштаб B2B", C.forest, ["Подписка для школ и управлений образования", "Интеграции с журналами · аналитика воспитания"]],
  ];
  // timeline line
  s.addShape(p.shapes.LINE, { x: 1.0, y: 2.7, w: 11.3, h: 0, line: { color: C.line, width: 2 } });
  phases.forEach((ph, i) => {
    const x = 0.7 + i * 3.05;
    s.addShape(p.shapes.OVAL, { x: x + 0.35, y: 2.5, w: 0.4, h: 0.4, fill: { color: ph[1] } });
    s.addText(`${i + 1}`, { x: x + 0.35, y: 2.5, w: 0.4, h: 0.4, align: "center", valign: "middle", fontFace: HEAD, fontSize: 13, bold: true, color: C.white });
    s.addShape(p.shapes.RECTANGLE, { x, y: 3.2, w: 2.85, h: 2.9, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    s.addShape(p.shapes.RECTANGLE, { x, y: 3.2, w: 2.85, h: 0.12, fill: { color: ph[1] } });
    s.addText(ph[0], { x: x + 0.22, y: 3.42, w: 2.45, h: 0.5, fontFace: HEAD, fontSize: 16, bold: true, color: C.ink });
    s.addText(ph[2].map((t, j) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: j < ph[2].length - 1 } })),
      { x: x + 0.25, y: 4.0, w: 2.4, h: 2.0, fontFace: BODY, fontSize: 12, color: C.muted, paraSpaceAfter: 8, valign: "top" });
    if (i < phases.length - 1) s.addText("→", { x: x + 2.85, y: 4.3, w: 0.2, h: 0.4, align: "center", fontSize: 18, bold: true, color: C.green });
  });
  s.addText("Сейчас здесь →  MVP полностью реализован, идём к пилоту", {
    x: 0.7, y: 6.4, w: 11.9, h: 0.5, fontFace: BODY, fontSize: 14, italic: true, bold: true, color: C.green, align: "center",
  });

  // ============================================================
  // SLIDE 8 — RISKS
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "08 — РИСКИ");
  title(s, "Риски и их нейтрализация");

  const rh = (t) => ({ text: t, options: { fill: { color: C.forest }, color: C.white, bold: true, fontSize: 13, valign: "middle" } });
  const rdata = [
    [rh("Риск"), rh("Нейтрализация"), rh("Статус")],
    ["Утечка ПДн детей во внешний LLM", "Локальная авто-анонимизация (regex + словари), явное согласие с логированием, повторный PII-чек перед шарингом", "реализовано"],
    ["LLM выдаёт некорректный / неструктурный контент", "Двухэтапный промпт, zod-валидация, repair-pass, авто-нормализация хронометража, RAG-опора на методички", "реализовано"],
    ["Зависимость от GigaChat (доступность, лимиты)", "Rate-limit, retry + refresh токена, кэш; библиотека сообщества снижает число генераций", "реализовано"],
    ["Нагрузка на 4 ГБ RAM", "Запрет локальных моделей, @react-pdf вместо headless Chrome, стриминг", "реализовано"],
    ["Качество подбора похожих", "Порог откалиброван (0.72) на наполненной библиотеке + RAG-корпус методичек", "реализовано"],
    ["Доверие педагогов к ИИ", "Человек в петле: полный редактор + версии + контроль", "реализовано"],
    ["Безопасность прод-инфры", "Docker Compose, nginx + HTTPS (Let's Encrypt), ufw, bind 127.0.0.1, ротация секретов", "реализовано"],
  ];
  const rows = rdata.map((r, ri) => {
    if (ri === 0) return r;
    const st = r[2];
    const stColor = st === "реализовано" ? C.green : C.goldD;
    return [
      { text: r[0], options: { bold: true, color: C.ink, fontSize: 12, valign: "middle" } },
      { text: r[1], options: { color: C.muted, fontSize: 11.5, valign: "middle" } },
      { text: st, options: { color: stColor, bold: true, fontSize: 11.5, align: "center", valign: "middle" } },
    ];
  });
  s.addTable(rows, {
    x: 0.7, y: 2.1, w: 11.9, colW: [3.7, 6.6, 1.6],
    rowH: 0.62, border: { type: "solid", pt: 0.5, color: C.line },
    fill: { color: C.card }, valign: "middle", margin: [3, 6, 3, 6],
  });

  // ============================================================
  // SLIDE 9 — BUSINESS / EFFECT (bonus)
  // ============================================================
  s = p.addSlide();
  s.background = { color: C.forest };
  s.addShape(p.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.18, fill: { color: C.gold } });
  s.addShape(p.shapes.RECTANGLE, { x: 0.34, y: 0.62, w: 0.34, h: 0.34, fill: { color: C.gold } });
  s.addText("+ БИЗНЕС-ЭФФЕКТ И МОДЕЛЬ", { x: 0.8, y: 0.5, w: 9, h: 0.55, fontFace: BODY, fontSize: 13, bold: true, color: C.greenL, charSpacing: 2, valign: "middle" });
  s.addText("Почему это растёт само", { x: 0.34, y: 0.95, w: 11.9, h: 0.95, fontFace: HEAD, fontSize: 32, bold: true, color: C.white, valign: "middle" });

  // 3 stat columns
  const stats = [
    ["≈ 2 ч", "экономии на каждом сценарии — время педагога возвращается детям"],
    ["~40 тыс.", "школ РФ; «Разговоры о важном» — еженедельный обязательный формат"],
    ["network", "эффект: больше лайков → богаче библиотека → точнее RAG → выше ценность"],
  ];
  stats.forEach((st, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.15, w: 3.8, h: 1.75, fill: { color: C.forest2 } });
    s.addText(st[0], { x: x + 0.25, y: 2.3, w: 3.3, h: 0.85, fontFace: HEAD, fontSize: st[0] === "network" ? 30 : 40, bold: true, color: C.gold, valign: "middle" });
    s.addText(st[1], { x: x + 0.25, y: 3.1, w: 3.3, h: 0.7, fontFace: BODY, fontSize: 12.5, color: C.greenL, valign: "top" });
  });

  // monetization row
  s.addText("Модель монетизации", { x: 0.7, y: 4.2, w: 6, h: 0.45, fontFace: HEAD, fontSize: 17, bold: true, color: C.white });
  const mon = [
    ["Free — педагог", "лимит генераций в день, базовый функционал"],
    ["Школа", "без лимита, библиотека, статистика, модерация"],
    ["Управление образования", "мульти-школа, аналитика по направлениям воспитания"],
  ];
  mon.forEach((m, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(p.shapes.RECTANGLE, { x, y: 4.7, w: 3.8, h: 1.35, fill: { color: C.card } });
    s.addShape(p.shapes.RECTANGLE, { x, y: 4.7, w: 3.8, h: 0.1, fill: { color: C.gold } });
    s.addText(m[0], { x: x + 0.25, y: 4.85, w: 3.3, h: 0.5, fontFace: HEAD, fontSize: 15, bold: true, color: C.ink });
    s.addText(m[1], { x: x + 0.25, y: 5.35, w: 3.35, h: 0.65, fontFace: BODY, fontSize: 12, color: C.muted, valign: "top" });
  });

  s.addText("Метрики успеха: число сгенерированных сценариев · % дошедших до экспорта · доля переиспользования из библиотеки · retention педагогов", {
    x: 0.7, y: 6.35, w: 11.9, h: 0.7, fontFace: BODY, fontSize: 13, italic: true, color: C.greenL, valign: "top",
  });

  // ============================================================
  // SLIDE 10 — ADDITIONAL INFO (bonus)
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "+ ДОПОЛНИТЕЛЬНО");
  title(s, "Чем ещё хочется поделиться");

  // LEFT — data sovereignty / deployment
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 2.1, w: 5.85, h: 4.75, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 2.1, w: 5.85, h: 0.12, fill: { color: C.green } });
  badge(s, 0.95, 2.4, 0.6, I.server, C.forest);
  s.addText("Суверенность данных и развёртывание", { x: 1.7, y: 2.4, w: 4.7, h: 0.6, fontFace: HEAD, fontSize: 16, bold: true, color: C.ink, valign: "middle" });
  s.addText([
    { text: "docker compose up — БД, миграции и приложение одной командой", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Переключаемая через env LLM (LLM_PROVIDER): GigaChat или локальная / OpenAI-совместимая (Ollama, LM Studio, vLLM)", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Данные детей могут не покидать контур школы — модель поднимается на своём железе", options: { bullet: { code: "2022" }, color: C.green, bold: true, breakLine: true } },
    { text: "TLS к GigaChat через вшитые сертификаты Минцифры РФ — без обхода проверки", options: { bullet: { code: "2022" }, breakLine: true } },
  ], { x: 1.0, y: 3.2, w: 5.35, h: 2.9, fontFace: BODY, fontSize: 13, color: C.ink, paraSpaceAfter: 8, valign: "top" });
  s.addText([
    { text: "Публичный репозиторий: ", options: { color: C.muted } },
    { text: "github.com/Caspernik-dev/planwise", options: { color: C.green, bold: true, hyperlink: { url: "https://github.com/Caspernik-dev/planwise" } } },
  ], { x: 1.0, y: 6.35, w: 5.35, h: 0.35, fontFace: BODY, fontSize: 12, italic: true, valign: "middle" });

  // RIGHT — lessons & insights
  s.addShape(p.shapes.RECTANGLE, { x: 6.75, y: 2.1, w: 5.85, h: 4.75, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
  s.addShape(p.shapes.RECTANGLE, { x: 6.75, y: 2.1, w: 5.85, h: 0.12, fill: { color: C.gold } });
  badge(s, 7.0, 2.4, 0.6, I.bolt, C.forest);
  s.addText("Уроки и инсайты", { x: 7.75, y: 2.4, w: 4.6, h: 0.6, fontFace: HEAD, fontSize: 16, bold: true, color: C.ink, valign: "middle" });
  s.addText([
    { text: "Генерация по блокам дала объём ×3 (≈15 КБ, РоВ-уровень) — масштаб числом блоков, а не «уговорами» модели", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Гейт качества без LLM-судьи: детерминированные проверки длины, многоходовости «Учитель: …» и числа вопросов — LLM-судья оказался ненадёжным", options: { bullet: { code: "2022" }, breakLine: true } },
    { text: "Главный урок: статика и моки не ловят баги живой модели (пустой adaptations, формат «дебаты») — обязателен живой прогон", options: { bullet: { code: "2022" }, color: C.goldD, bold: true } },
  ], { x: 7.05, y: 3.2, w: 5.35, h: 3.5, fontFace: BODY, fontSize: 13, color: C.ink, paraSpaceAfter: 10, valign: "top" });

  // ============================================================
  // SLIDE 11 — WHAT'S NEXT (in progress + roadmap)
  // ============================================================
  s = p.addSlide(); pageBg(s);
  kicker(s, "+ ЧТО ДАЛЬШЕ");
  title(s, "В работе и в дорожной карте");

  s.addText("Конкретные доработки из бэклога — что уже в работе и в ближайших спринтах после MVP", {
    x: 0.7, y: 1.85, w: 11.9, h: 0.4, fontFace: BODY, fontSize: 13, italic: true, color: C.muted,
  });

  const nextCols = [
    {
      head: "Продукт для учителя",
      icon: I.edit,
      headBg: C.forest,
      items: [
        "Кастомные инструкции — «стиль учителя» (тон, игровость, ОВЗ)",
        "Адаптация сценария под другой класс / длительность одной кнопкой",
        "Предпросмотр документа перед экспортом",
        "Режим проведения с телефона + потоковый текст блока в реальном времени",
        "Загрузка плана картинкой (OCR) — фото с телефона",
      ],
    },
    {
      head: "Сообщество и обнаруживаемость",
      icon: I.users,
      headBg: C.forest2,
      items: [
        "Комментарии и отзывы коллег под сценариями",
        "Теги и «топ недели» в библиотеке",
        "Модерация: «сообщить о проблеме» → admin",
        "Личная аналитика педагога: сценарии, направления, динамика",
        "Опц. публичные профили учителей (opt-in, репутация)",
      ],
    },
    {
      head: "Масштаб и качество",
      icon: I.chart,
      headBg: C.forest,
      items: [
        "Очередь + семафор к GigaChat — под рост тарифной концурентности",
        "Дашборд качества генерации (тонкие блоки, предупреждения)",
        "Кеш эмбеддингов популярных тем — экономия токенов",
        "Отчёт завучу: XLSX-выгрузка по проведённым занятиям",
        "Атомарный rate-limit + worker-thread для PDF",
      ],
    },
  ];

  nextCols.forEach((col, i) => {
    const x = 0.7 + i * 4.05;
    const cardH = 4.55;
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.4, w: 3.85, h: cardH, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: sh() });
    // header strip
    s.addShape(p.shapes.RECTANGLE, { x, y: 2.4, w: 3.85, h: 0.85, fill: { color: col.headBg } });
    badge(s, x + 0.22, 2.52, 0.6, col.icon, C.gold);
    s.addText(col.head, { x: x + 0.95, y: 2.42, w: 2.8, h: 0.82, fontFace: HEAD, fontSize: 14, bold: true, color: C.white, valign: "middle" });
    // bullets
    s.addText(col.items.map((t, j) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: j < col.items.length - 1, color: C.ink } })),
      { x: x + 0.25, y: 3.4, w: 3.4, h: cardH - 1.1, fontFace: BODY, fontSize: 11.5, paraSpaceAfter: 6, valign: "top" });
  });

  // footer line
  s.addShape(p.shapes.RECTANGLE, { x: 0.7, y: 7.05, w: 11.9, h: 0.32, fill: { color: C.bg }, line: { color: C.green, width: 1 } });
  s.addText([
    { text: "Полный бэклог: ", options: { bold: true, color: C.green } },
    { text: "docs/backlog.md в репозитории — приоритеты, оценки объёма и связи между задачами", options: { color: C.muted } },
  ], { x: 0.95, y: 7.05, w: 11.5, h: 0.32, fontFace: BODY, fontSize: 11, italic: true, valign: "middle" });

  await p.writeFile({ fileName: "Planwise-Klassniy-Chas.pptx" });
  console.log("OK written");
})();
