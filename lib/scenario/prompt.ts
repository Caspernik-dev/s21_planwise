import { gradeToLevel, levelLabel } from './levels'
import { formatGradeForPrompt } from './options'
import { getCatalog } from './personal-results'
import type { GenerationInput, ScenarioSkeleton } from './schema'

export const PROMPT_VERSION = 'v10-pr-relevance-2026-05-30'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type RagChunkForPrompt = { text: string; documentTitle: string; sectionKind: string }

export type SharedExampleForPrompt = { title: string; summary: string }

const SCHEMA_HINT = `Структура JSON (строго соблюдай ключи и типы):
{
  "title": string,
  "goals": string[],              // 2-4 пункта: воспитательные результаты И формируемые ценности (что осмыслят/прочувствуют дети)
  "materials": string[],          // что нужно для занятия
  "stages": [                     // минимум 3 этапа: вовлечение (мотивационно-целевой), основная часть, рефлексия (заключительный)
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,     // целое, в минутах; сумма по этапам ≈ длительности занятия
      "activities": [
        {
          // type — ВЫБЕРИ СТРОГО одно из пяти: discussion, quiz, game, task, video. НЕ ПРИДУМЫВАЙ
          // других значений. Презентация/слайды → ПИШИ video; работа в группах/практическое → ПИШИ task; беседа → discussion.
          "type": "discussion" | "quiz" | "game" | "task" | "video",
          // text: ПЛОТНЫЙ готовый к проведению сценарий уровня «Разговоров о важном».
          // НЕСКОЛЬКО реплик «Учитель: …» подряд, каждая 3-6 развёрнутых предложений, с КОНКРЕТНЫМ
          // содержанием по теме (факты, примеры, истории, ценностные смыслы — не вода). Где дети отвечают —
          // ставь пометку «Ответы обучающихся.» и продолжай. Текста должно хватать, чтобы провести занятие,
          // читая дословно. ЗАПРЕЩЕНЫ обобщения «учитель рассказывает / объясняет / обсуждает».
          "text": string,
          // questions: для бесед/обсуждений — 3-5 РАЗВЁРНУТЫХ вопросов, выстроенных по нарастанию:
          // (1) вовлекающий, (2-3) на анализ и осмысление сути, (4-5) на личное отношение и ценностный вывод.
          // Вопросы конкретные, открытые, по теме — НЕ общие («что вы думаете?»).
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
    'Твой эталон качества — сценарии «Разговоры о важном»: глубокие, содержательные,',
    'с ясными ценностными смыслами и плотным, готовым к проведению ходом занятия.',
    'Генерируешь сценарии строго в формате JSON, без markdown-обёрток и пояснений.',
    'Правила: возрастная адаптация, ведущая роль педагога и активная роль детей,',
    'обязательная рефлексия в конце.',
    'ГЛУБИНА (главное): раскрывай тему содержательно — основная часть должна нести',
    'конкретные смыслы, факты, примеры и ценностные акценты по теме, а не общие слова.',
    'В поле text давай ПЛОТНЫЙ готовый сценарий: несколько реплик «Учитель: …» подряд',
    '(каждая 3-6 развёрнутых предложений) + пометки «Ответы обучающихся.» там, где дети',
    'отвечают. Текста должно хватать, чтобы провести занятие, читая дословно.',
    'НЕ ПИШИ обобщения «учитель рассказывает / объясняет / показывает видео» — ВМЕСТО этого ДАВАЙ дословные реплики «Учитель: …».',
    'ВОПРОСЫ ученикам — развёрнутые и разноуровневые (вовлечение → анализ сути →',
    'личное отношение и ценностный вывод), конкретные и открытые, по 3-5 на обсуждение.',
    'ОБЪЁМ (обязательно): основная часть раскрывает 2-3 ключевых смысла темы, на каждый —',
    'факт/пример/история и 2-3 реплики «Учитель: …»; в основной части не менее 2-3 активностей.',
    'Не экономь текст: сценарий должен быть развёрнутым, как настоящая методичка.',
    'Никогда не используй реальные имена детей или персональные данные.',
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

const SKELETON_SCHEMA_HINT = `Структура JSON каркаса (БЕЗ полного текста активностей — их распишут отдельно):
{
  "title": string,
  "goals": string[],            // 2-4 воспитательных результата
  "values": string[],           // формируемые ценности (1-3): напр. «дружба», «созидательный труд»
  "coreMeanings": string[],     // основные смыслы (3-4): ценностные тезисы по теме, КАЖДЫЙ развёрнутой фразой
  "personalResults": string[],  // 3-5 ДОСЛОВНЫХ формулировок из [PERSONAL_RESULTS_CATALOG]
  "materials": string[],        // что нужно для занятия
  "adaptations": { "simpler": string, "harder": string },
  "stages": [                   // минимум 3 этапа: вовлечение (engage), основная часть (main), рефлексия (reflection)
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      // blocks — КОНТЕНТ-ПЛАН этапа: на КАЖДЫЙ блок отдельная карточка {type, focus}.
      // focus — конкретно, ЧТО раскрывает блок и какой смысл несёт (а не общие слова).
      // Распредели основные смыслы по блокам, без повторов между блоками.
      // main: 2-4 блока; engage и reflection: 1-2 блока.
      "blocks": [ { "type": "discussion" | "quiz" | "game" | "task" | "video", "focus": string } ]
    }
  ]
}`

export function buildSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
  const system = [
    'Ты — опытный методист внеурочной деятельности в школе РФ, эталон — «Разговоры о важном».',
    'Ты строишь КАРКАС сценария: название, цели, формируемые ценности, основные смыслы',
    '(ценностные тезисы по теме), материалы, адаптации и список этапов с длительностью.',
    'ОСНОВНЫЕ СМЫСЛЫ — это содержательное ядро: 3-4 развёрнутых тезиса, ЧТО важное должны',
    'осознать дети по этой теме (не общие слова). Активности на этом шаге НЕ пиши.',
    'Отвечаешь строго JSON, без markdown и пояснений. Без реальных имён детей.',
    'Для КАЖДОГО этапа составь контент-план blocks: список блоков {type, focus}, где focus —',
    'конкретное содержание блока. Основная часть — 2-4 блока, старт и рефлексия — 1-2.',
    ...(userMaterial.trim().length > 0
      ? [
          'Если ниже дан [TEACHER_MATERIAL] — это ГЛАВНЫЙ источник содержания и структуры; строй каркас прежде всего на нём, методички используй как дополнение.',
        ]
      : []),
    '',
    SKELETON_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект каркаса. Сумма duration_min ≈ длительности занятия.',
  ].join('\n')

  const material =
    userMaterial.trim().length > 0
      ? [
          '',
          '[TEACHER_MATERIAL] (ГЛАВНЫЙ источник — опирайся прежде всего на него, методички ниже вторичны):',
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
          `Из списка выше выбери ТОЛЬКО те формулировки (3-5), которые ПРЯМО связаны с темой «${input.topic}».`,
          'Критерий: формулировка должна описывать изменение в личности ученика, которое реально достигается этим занятием по этой теме.',
          'Если связь натянутая, общая («про всё хорошее») или формулировка про другой контекст (экстремизм, выборы, экология и т.п., когда тема про другое) — НЕ ВЫБИРАЙ её. Лучше 3 точно подходящих, чем 5 случайных.',
          'Верни их ДОСЛОВНО, без правок и сокращений, в массиве "personalResults" каркаса.',
          'Не придумывай свои формулировки — только из этого списка.',
        ]
      : []

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
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

const BLOCK_SCHEMA_HINT = `Верни JSON ТОЛЬКО для ОДНОГО блока (одна активность):
{
  // type — СТРОГО одно из пяти: discussion, quiz, game, task, video. НЕ придумывай других.
  // презентация/слайды → video; работа в группах/практическое → task; беседа → discussion.
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  // text: ПЛОТНЫЙ готовый ход ОДНОГО блока уровня «Разговоров о важном» — несколько реплик
  // «Учитель: …» подряд (каждая 3-6 развёрнутых предложений) с КОНКРЕТНЫМ содержанием
  // (факты, примеры, истории, цитаты, ценностные смыслы) + пометки «Ответы обучающихся.».
  "text": string,
  // questions: для обсуждений — 3-5 РАЗВЁРНУТЫХ разноуровневых вопросов
  // (вовлечение → анализ сути → личное отношение и ценностный вывод).
  "questions"?: string[]
}`

// Промпт для генерации деталей ОДНОГО блока (per-block — даёт РоВ-глубину: каждый вызов
// насыщается на один блок, объём масштабируется числом блоков).
export function buildBlockMessages(
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
    'Ты — опытный методист внеурочной деятельности в школе РФ, эталон — «Разговоры о важном».',
    'Тебе дан каркас занятия и ОДИН его блок (одна активность). Распиши ПОДРОБНО ТОЛЬКО этот блок.',
    `Этап блока — ${stageRole}.`,
    'ГЛУБИНА: в поле text давай ПЛОТНЫЙ готовый ход — несколько реплик «Учитель: …» подряд',
    '(каждая 3-6 развёрнутых предложений) с конкретным содержанием по теме (факты, примеры,',
    'истории, цитаты, ценностные смыслы) + пометки «Ответы обучающихся.» там, где отвечают дети.',
    'НЕ ПИШИ обобщения «учитель рассказывает / объясняет / показывает видео» — ДАВАЙ дословную речь.',
    'Текста должно хватать, чтобы провести этот блок, читая дословно.',
    'ВОПРОСЫ — развёрнутые, разноуровневые, по 3-5 на обсуждение.',
    'Раскрывай ИМЕННО фокус этого блока, не дублируй то, что уже было в предыдущих блоках.',
    ...(userMaterial.trim().length > 0
      ? [
          'Если дан [TEACHER_MATERIAL] — это основной источник содержания этого блока, опирайся прежде всего на него.',
        ]
      : []),
    'ФАКТЫ: НЕ выдумывай конкретные факты — даты, имена реальных людей, цитаты, статистику, точные названия —',
    'которых нет в [TEACHER_MATERIAL] или методичках ([RELEVANT_METHODOLOGY]). Нужен пример — подавай его как гипотетический',
    '(«представим…», «например, кто-то мог бы…»), а не как достоверный факт. Лучше общая формулировка, чем выдуманная точность.',
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
          '[TEACHER_MATERIAL] (ГЛАВНЫЙ источник — опирайся прежде всего на него):',
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
