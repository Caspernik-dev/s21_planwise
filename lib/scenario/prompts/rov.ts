import { gradeToLevel, gradeToRovGroup, levelLabel } from '../levels'
import { formatGradeForPrompt } from '../options'
import { getCatalog } from '../personal-results'
import type { GenerationInput, ScenarioSkeleton } from '../schema'
import { VALUES_809 } from '../values-809'
import type { ChatMessage, RagChunkForPrompt, SharedExampleForPrompt } from './shared'

export type { ChatMessage, RagChunkForPrompt, SharedExampleForPrompt }

export const PROMPT_VERSION = 'v12-rov-tz-2026-05-31'

const AGE_POLICY = `ВОЗРАСТНАЯ АДАПТАЦИЯ:
- 1-4 классы: простой язык, короткие инструкции, конкретные бытовые примеры, минимум абстракции.
- 5-7 классы: понятные жизненные ситуации, умеренная терминология, без псевдонаучных и излишне формальных объяснений.
- 8-11 классы и СПО: допускаются дискуссия, аргументация, анализ последствий и личной позиции.
- Не используй лексику, глубину рассуждений и формулировки выше возрастного уровня аудитории.`

const FACT_POLICY = `ФАКТЫ И ТОЧНОСТЬ:
- Не выдумывай даты, цитаты, статистику, медицинские эффекты, юридические трактовки, символы праздников, исторические детали и точные названия, если их нет во входных материалах или методических фрагментах.
- Если точный факт не нужен для проведения занятия, используй нейтральную общую формулировку без ложной конкретики.
- Лучше безопасное обобщение, чем сомнительная детализация.
- Никаких псевдонаучных объяснений и "умных" фактов ради эффекта.`

const STYLE_POLICY = `СТИЛЬ:
- Пиши кратко, предметно, без воды, пафоса и канцелярита.
- Одна реплика «Учитель: …» обычно 1-3 предложения, а не длинный монолог.
- Не повторяй одну и ту же мысль разными словами в соседних репликах, вопросах и блоках.
- Текст должен быть пригоден как опора для проведения занятия, но без ощущения зачитанной лекции.
- Запрещены обобщения вида «учитель рассказывает / объясняет / обсуждает / показывает»; вместо этого давай короткие, живые, готовые реплики.`

const TIMING_POLICY = `РЕАЛИСТИЧНОСТЬ И ТАЙМИНГ:
- Все активности должны реально помещаться в указанную длительность.
- Для занятия 30 минут: не более 3 содержательных этапов + рефлексия.
- В каждом этапе одна ведущая активность.
- Не перегружай этап множеством подзадач.
- Разнообразие важно, но не ценой перегруза: лучше 1 хорошо сделанная активность, чем 3 поверхностные.`

const SCHEMA_HINT = `Структура JSON (строго соблюдай ключи и типы):
{
  "title": string,
  "goals": string[],              // 2-4 пункта: воспитательные результаты и формируемые ценности
  "materials": string[],          // что нужно для занятия
  "stages": [
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      "activities": [
        {
          // type — строго одно из пяти: discussion, quiz, game, task, video
          "type": "discussion" | "quiz" | "game" | "task" | "video",
          // text: короткий, плотный, готовый к проведению ход одной активности
          // с репликами «Учитель: …» и пометками «Ответы обучающихся.» там, где это нужно.
          // Без длинных монологов, без воды, без выдуманных фактов.
          "text": string,
          // questions: для discussion/video обычно 2-3 конкретных открытых вопроса.
          // Не общие, не повторяющиеся, по теме и по возрасту.
          "questions"?: string[]
        }
      ]
    }
  ],
  "adaptations": { "simpler": string, "harder": string }
}`

export function buildMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — опытный методист внеурочной деятельности в школе РФ.',
    'Твой ориентир — качественный, реалистичный сценарий занятия, который можно провести в обычном классе без большой переработки.',
    'Генерируешь сценарии строго в формате JSON, без markdown-обёрток и пояснений.',
    'Сценарий должен быть содержательным, но компактным: не методичка на несколько страниц, а пригодный к использованию план с готовыми репликами.',
    '',
    AGE_POLICY,
    '',
    STYLE_POLICY,
    '',
    FACT_POLICY,
    '',
    TIMING_POLICY,
    '',
    'СТРУКТУРА:',
    '- обязательна возрастная адаптация;',
    '- обязательна ведущая роль педагога и активная роль детей;',
    '- обязательна рефлексия в конце;',
    '- основная часть должна раскрывать 2-3 ключевых смысла темы без повторов;',
    '- соседние этапы не должны дублировать один и тот же тип активности.',
    '',
    SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект по схеме. Никакого текста до или после.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся на эти фрагменты методичек, но не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const examples =
    sharedExamples.length > 0
      ? [
          '',
          '[GOOD_EXAMPLES] (удачные сценарии коллег по похожим темам — ориентир по структуре, не копируй текст):',
          ...sharedExamples.map((e, i) => `(${i + 1}) ${e.title}: ${e.summary}`),
        ]
      : []

  const user = [
    'Сгенерируй сценарий внеурочного занятия со следующими параметрами:',
    `- Направление воспитания: ${input.direction}`,
    `- Аудитория: ${formatGradeForPrompt(input.grade)}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    ...methodology,
    ...examples,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

const SKELETON_SCHEMA_HINT = `Структура JSON каркаса (без полного текста активностей):
{
  "title": string,
  "goals": string[],            // 2-4 воспитательных результата
  "values": string[],           // формируемые ценности (1-3)
  "coreMeanings": string[],     // 3-4 основных смысла темы, каждый отдельной развёрнутой фразой
  "personalResults": string[],  // 3-5 ДОСЛОВНЫХ формулировок из [PERSONAL_RESULTS_CATALOG]
  "leadingValue": string,        // ДОСЛОВНО одна из 17 ценностей Указа 809
  "secondaryValues": string[],   // 0..3 ДОСЛОВНО из тех же 17, без повторения ведущей
  "valueFormulations": [         // 0..5 живых формулировок темы; каждая привязана к базовой
    { "text": string, "basedOn": string }
  ],
  "materials": string[],
  "adaptations": { "simpler": string, "harder": string },
  "stages": [
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      // blocks — контент-план этапа: каждый блок = одна ведущая активность.
      // focus — конкретно, что раскрывает блок и какой новый смысл он добавляет.
      // Не дублируй один и тот же смысл в нескольких блоках.
      // Для 30 минут: engage — 1 блок, main — 1-2 блока, reflection — 1 блок.
      "blocks": [ { "type": "discussion" | "quiz" | "game" | "task" | "video", "focus": string } ]
    }
  ]
}`

export function buildRovSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
  const rovGroup = gradeToRovGroup(input.grade)

  const system = [
    'Ты — опытный методист внеурочной деятельности в школе РФ, ориентир — качественные сценарии «Разговоров о важном».',
    'Ты строишь КАРКАС сценария: название, цели, формируемые ценности, основные смыслы, материалы, адаптации и этапы с длительностью.',
    'Отвечаешь строго JSON, без markdown и пояснений. Без реальных имён детей.',
    '',
    AGE_POLICY,
    '',
    STYLE_POLICY,
    '',
    FACT_POLICY,
    '',
    TIMING_POLICY,
    '',
    'ОСНОВНЫЕ СМЫСЛЫ — это содержательное ядро: 3-4 развёрнутых тезиса о том, что действительно должны осознать дети по теме.',
    'Не пиши общие слова ради объёма.',
    'Для каждого этапа составь контент-план blocks: список блоков {type, focus}, где focus — конкретное содержание блока.',
    'Каждый блок должен добавлять новый смысл или новый ракурс, а не повторять предыдущий.',
    '- Сценарий относится к курсу «Разговоры о важном» (1-й урок понедельника).',
    `- Возрастная группа РоВ: ${rovGroup}.`,
    '- Первый блок мотивационной части — просмотр и обсуждение короткого видеоролика по теме. Не выдумывай ссылку и конкретное название ролика.',
    '- Не педалируй заучивание определений: важнее осмысление темы через понятные ситуации и обсуждение.',
    '- Адаптируй задания под региональный/этнокультурный контекст и состав семей класса (учитель уточнит при правке).',
    '- Не стремись искусственно включить много типов активности. Важнее цельность и реалистичность.',
    ...(userMaterial.trim().length > 0
      ? [
          'Если ниже дан [TEACHER_MATERIAL] — это главный источник содержания и структуры; строй каркас прежде всего на нём, методички используй как дополнение.',
        ]
      : []),
    '',
    SKELETON_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект каркаса. Сумма duration_min должна быть близка к общей длительности занятия.',
  ].join('\n')

  const material =
    userMaterial.trim().length > 0
      ? [
          '',
          '[TEACHER_MATERIAL] (главный источник — опирайся прежде всего на него, методички ниже вторичны):',
          userMaterial.trim(),
        ]
      : []

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (ориентир по структуре, не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const examples =
    sharedExamples.length > 0
      ? [
          '',
          '[GOOD_EXAMPLES] (удачные сценарии коллег — ориентир по структуре):',
          ...sharedExamples.map((e, i) => `(${i + 1}) ${e.title}: ${e.summary}`),
        ]
      : []

  const personalResultsCatalog = input.direction
    ? getCatalog(gradeToLevel(input.grade), input.direction)
    : []

  const personalResultsBlock =
    personalResultsCatalog.length > 0
      ? [
          '',
          `[PERSONAL_RESULTS_CATALOG] (личностные результаты из ФГОС ${levelLabel(gradeToLevel(input.grade))}, направление «${input.direction}»):`,
          ...personalResultsCatalog.map((f, i) => `${i + 1}. ${f}`),
          '',
          `Из списка выше выбери только те формулировки (3-5), которые прямо связаны с темой «${input.topic}».`,
          'Критерий: формулировка должна описывать реальный личностный результат, которого можно достичь на этом занятии.',
          'Если связь натянутая или слишком общая, не выбирай её.',
          'Верни формулировки ДОСЛОВНО, без правок и сокращений, в массиве "personalResults".',
          'Не придумывай свои формулировки — только из этого списка.',
        ]
      : []

  const valuesCatalogBlock = [
    '',
    '[VALUES_809_CATALOG] (традиционные ценности Указа Президента РФ от 09.11.2022 № 809):',
    ...VALUES_809.map((v, i) => `${i + 1}. ${v}`),
    '',
    'Выбери одну ведущую ценность занятия в поле "leadingValue" — ДОСЛОВНО из списка выше.',
    'Опционально 0–3 сопутствующих ценности в "secondaryValues" — тоже ДОСЛОВНО из списка, без повторения ведущей.',
    'Опционально 0–5 живых формулировок темы в "valueFormulations": каждая {text, basedOn},',
    'где text — это словесная формулировка занятия (например, «дружба», «Родина», «честность»),',
    'а basedOn ОБЯЗАТЕЛЬНО одна из 17 базовых ценностей выше.',
    'Не придумывай свои базовые ценности — только из списка.',
  ]

  const user = [
    'Построй каркас сценария внеурочного занятия:',
    `- Направление воспитания: ${input.direction}`,
    `- Аудитория: ${formatGradeForPrompt(input.grade)}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    ...material,
    ...methodology,
    ...examples,
    ...personalResultsBlock,
    ...valuesCatalogBlock,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

// Keep the old name as alias for backward compat
export const buildSkeletonMessages = buildRovSkeletonMessages

const BLOCK_SCHEMA_HINT = `Верни JSON только для ОДНОГО блока:
{
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  // text: короткий, плотный, готовый ход ОДНОГО блока с репликами «Учитель: …»
  // и пометками «Ответы обучающихся.». Без длинных монологов, без воды, без выдуманных фактов.
  "text": string,
  // questions: для discussion/video обычно 2-3 конкретных открытых вопроса по теме и возрасту.
  "questions"?: string[]
}`

export function buildRovBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): ChatMessage[] {
  const stageRole =
    stage.kind === 'engage'
      ? 'мотивационно-целевой этап (эмоциональный старт, включение в тему)'
      : stage.kind === 'reflection'
        ? 'заключительный этап (рефлексия, личный вывод каждого)'
        : 'основная смысловая часть (раскрытие сути темы, интерактив)'

  const system = [
    'Ты — опытный методист внеурочной деятельности в школе РФ, ориентир — качественные сценарии «Разговоров о важном».',
    'Тебе дан каркас занятия и ОДИН его блок (одна активность). Распиши подробно только этот блок.',
    `Этап блока — ${stageRole}.`,
    '',
    AGE_POLICY,
    '',
    STYLE_POLICY,
    '',
    FACT_POLICY,
    '',
    TIMING_POLICY,
    '',
    'Раскрывай именно фокус этого блока и не дублируй то, что уже было в предыдущих блоках.',
    'Каждый блок должен быть компактным, содержательным и реально проводимым.',
    'Для discussion/video обычно достаточно 2-3 конкретных открытых вопросов.',
    ...(userMaterial.trim().length > 0
      ? [
          'Если дан [TEACHER_MATERIAL] — это основной источник содержания этого блока, опирайся прежде всего на него.',
        ]
      : []),
    'Отвечаешь строго JSON одного блока, без markdown. Без реальных имён детей.',
    '',
    BLOCK_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект одного блока { "type": …, "text": …, "questions"?: … }.',
  ].join('\n')

  const material =
    userMaterial.trim().length > 0
      ? [
          '',
          '[TEACHER_MATERIAL] (главный источник — опирайся прежде всего на него):',
          userMaterial.trim(),
        ]
      : []

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся на факты и стиль, но не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const meanings =
    skeleton.coreMeanings && skeleton.coreMeanings.length > 0
      ? [
          '',
          'Основные смыслы занятия (держи в уме, раскрывай уместные в этом блоке):',
          ...skeleton.coreMeanings.map((m) => `• ${m}`),
        ]
      : []

  const user = [
    `Занятие: «${skeleton.title}». Тема «${input.topic}», направление ${input.direction}, ${formatGradeForPrompt(input.grade)}, формат ${input.format}.`,
    `Этап: «${stage.title}» (${stage.kind}, ${stage.duration_min} мин).`,
    `Блок (${brief.type}): ${brief.focus}`,
    ...meanings,
    ...material,
    ...methodology,
    ...(runningContext ? ['', runningContext] : []),
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

// Keep the old name as alias for backward compat
export const buildBlockMessages = buildRovBlockMessages
