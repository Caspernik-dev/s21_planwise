import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { randomBytes } from 'node:crypto'
import { hashPassword } from '@/lib/auth/password'
import { strictPiiCheck } from '@/lib/community/pii-gate'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { scenarioContentSchema } from '@/lib/scenario/schema'
import { and, eq } from 'drizzle-orm'

const SEED_EMAIL = process.env.SEED_LIBRARY_EMAIL ?? 'library@planwise.local'

type Seed = {
  direction: string
  grade: number
  durationMin: number
  format: string
  topic: string
  content: ScenarioContent
}

// Сценарии-«паттерны» под структуру методичек «Разговоры о важном»:
// цели как воспитательные результаты → основные смыслы → вопросы для обсуждения → рефлексия.
const LIBRARY: Seed[] = [
  {
    direction: 'Патриотическое',
    grade: 4,
    durationMin: 45,
    format: 'классный час',
    topic: 'День народного единства',
    content: {
      title: 'Когда мы вместе — мы сильнее',
      goals: [
        'Сформировать представление о единстве народов России как основе силы страны',
        'Развивать чувство сопричастности к истории Родины',
      ],
      materials: ['Карта России', 'Карточки с пословицами о дружбе и единстве', 'Цветные стикеры'],
      stages: [
        {
          kind: 'engage',
          title: 'Эмоциональный старт: «Один прутик и веник»',
          duration_min: 8,
          activities: [
            {
              type: 'discussion',
              text: 'Учитель показывает один прутик (легко ломается) и связку прутьев (не ломается). Подводит детей к мысли: вместе мы крепче.',
              questions: [
                'Почему один прутик сломать легко, а связку — нет?',
                'А как это связано с людьми?',
              ],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Основная часть: народы большой страны',
          duration_min: 27,
          activities: [
            {
              type: 'discussion',
              text: 'На карте России отмечаем, что в стране живут люди разных народов. Обсуждаем, что нас объединяет: язык, история, общий дом.',
              questions: [
                'Какие народы живут в нашей стране?',
                'Что у всех нас общего?',
                'Почему важно уважать друг друга?',
              ],
            },
            {
              type: 'game',
              text: 'Игра «Собери пословицу»: дети в парах складывают разрезанные пословицы о дружбе и единстве и объясняют смысл.',
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Одной фразой»',
          duration_min: 10,
          activities: [
            {
              type: 'task',
              text: 'Каждый продолжает фразу на стикере: «Мы сильнее, когда…» и приклеивает на общий плакат-карту.',
            },
          ],
        },
      ],
      adaptations: {
        simpler:
          'Для 1–2 классов убрать работу с картой, оставить опыт с прутиками и хоровод «Мы вместе».',
        harder:
          'Для 5–6 классов добавить мини-сообщения о народных праздниках разных регионов России.',
      },
    },
  },
  {
    direction: 'Гражданское',
    grade: 7,
    durationMin: 30,
    format: 'беседа',
    topic: 'День Конституции РФ',
    content: {
      title: 'Мои права и мои обязанности',
      goals: [
        'Познакомить с понятием Конституции как основного закона',
        'Сформировать понимание связи прав и обязанностей гражданина',
      ],
      materials: ['Памятка «Права и обязанности школьника»', 'Презентация'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Что такое правила?»',
          duration_min: 6,
          activities: [
            {
              type: 'discussion',
              text: 'Учитель предлагает представить игру без правил. Обсуждаем, зачем нужны правила и законы.',
              questions: ['Что будет, если в игре нет правил?', 'Зачем обществу нужны законы?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Беседа: главный закон страны',
          duration_min: 17,
          activities: [
            {
              type: 'discussion',
              text: 'Знакомимся с тем, что Конституция гарантирует права (на образование, отдых, защиту) и закрепляет обязанности.',
              questions: [
                'Какие права есть у каждого гражданина?',
                'Почему у прав есть «обратная сторона» — обязанности?',
                'Как право одного человека связано со свободой другого?',
              ],
            },
            {
              type: 'task',
              text: 'В парах: к каждому праву подобрать соответствующую обязанность (право на чистый класс — обязанность поддерживать порядок).',
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Закончи предложение»',
          duration_min: 7,
          activities: [
            {
              type: 'task',
              text: 'Каждый завершает: «Быть гражданином — значит…».',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 5 класса свести к обсуждению школьных правил без юридических терминов.',
        harder:
          'Для 9–11 классов разобрать конкретную статью Конституции и реальный пример из жизни.',
      },
    },
  },
  {
    direction: 'Духовно-нравственное',
    grade: 2,
    durationMin: 20,
    format: 'игра',
    topic: 'День матери в России',
    content: {
      title: 'Самое тёплое слово — мама',
      goals: [
        'Воспитывать уважение и любовь к маме и семье',
        'Развивать умение выражать благодарность близким',
      ],
      materials: ['Лепестки из цветной бумаги', 'Клей', 'Заготовка «цветок»'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Ласковые слова»',
          duration_min: 5,
          activities: [
            {
              type: 'game',
              text: 'Дети передают по кругу мягкую игрушку и называют ласковое слово о маме.',
            },
          ],
        },
        {
          kind: 'main',
          title: 'Игра-мастерская «Цветок благодарности»',
          duration_min: 10,
          activities: [
            {
              type: 'task',
              text: 'Каждый ребёнок пишет (или рисует) на лепестке доброе дело для мамы и собирает общий цветок класса.',
              questions: [
                'Как мы можем помочь маме дома?',
                'За что ты хочешь сказать маме спасибо?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Подарю дома»',
          duration_min: 5,
          activities: [
            {
              type: 'discussion',
              text: 'Дети рассказывают, какое доброе дело сделают для мамы сегодня вечером.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 1 класса заменить надписи рисунками-символами.',
        harder: 'Для 3–4 классов добавить написание короткого письма-благодарности маме.',
      },
    },
  },
  {
    direction: 'Эстетическое',
    grade: 6,
    durationMin: 45,
    format: 'мастерская',
    topic: 'Международный женский день',
    content: {
      title: 'Красота вокруг нас: открытка весны',
      goals: [
        'Развивать художественный вкус и умение видеть прекрасное',
        'Воспитывать внимательное и заботливое отношение к женщинам',
      ],
      materials: ['Бумага для акварели', 'Краски, кисти', 'Образцы весенних мотивов'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: галерея весны',
          duration_min: 8,
          activities: [
            {
              type: 'discussion',
              text: 'Рассматриваем репродукции картин с весенними мотивами, обсуждаем настроение и цвет.',
              questions: [
                'Какие чувства вызывает весна?',
                'Как художник передаёт настроение цветом?',
              ],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Мастерская: создаём открытку',
          duration_min: 27,
          activities: [
            {
              type: 'task',
              text: 'Каждый создаёт акварельную открытку-поздравление, используя тёплую палитру и весенние образы.',
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Вернисаж»',
          duration_min: 10,
          activities: [
            {
              type: 'discussion',
              text: 'Устраиваем мини-выставку; каждый говорит, кому подарит открытку и почему.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для младших классов заменить акварель на аппликацию из готовых элементов.',
        harder: 'Для 8–9 классов предложить технику коллажа с цитатой о красоте.',
      },
    },
  },
  {
    direction: 'Физическое и здоровье',
    grade: 5,
    durationMin: 30,
    format: 'квиз',
    topic: 'Секреты здорового образа жизни',
    content: {
      title: 'Квиз «Маршрут здоровья»',
      goals: [
        'Сформировать ценность здорового образа жизни',
        'Закрепить знания о режиме дня, питании и движении',
      ],
      materials: ['Карточки с вопросами', 'Табло для команд'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: разминка-зарядка',
          duration_min: 5,
          activities: [
            {
              type: 'game',
              text: 'Короткая весёлая зарядка под счёт — настрой на тему и деление на команды.',
            },
          ],
        },
        {
          kind: 'main',
          title: 'Квиз в командах',
          duration_min: 18,
          activities: [
            {
              type: 'quiz',
              text: 'Команды отвечают на вопросы по раундам: режим дня, полезная еда, спорт, гигиена.',
              questions: [
                'Сколько часов сна нужно школьнику?',
                'Какие продукты дают энергию, а какие — «пустые»?',
                'Зачем нужны перерывы при выполнении уроков?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Один шаг к здоровью»',
          duration_min: 7,
          activities: [
            {
              type: 'task',
              text: 'Каждый называет одну привычку, которую начнёт соблюдать с завтрашнего дня.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 1–3 классов использовать картинки вместо текстовых вопросов.',
        harder: 'Для 7–8 классов добавить раунд о вреде вредных привычек и стрессе.',
      },
    },
  },
  {
    direction: 'Трудовое',
    grade: 9,
    durationMin: 30,
    format: 'беседа',
    topic: 'Мир профессий: как выбрать своё дело',
    content: {
      title: 'Профессия по душе',
      goals: [
        'Расширить представления о мире профессий',
        'Развивать осознанное отношение к выбору будущего пути',
      ],
      materials: ['Карточки «профессия — качество»', 'Презентация о востребованных профессиях'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Угадай профессию»',
          duration_min: 6,
          activities: [
            {
              type: 'game',
              text: 'Учитель описывает действия — ученики угадывают профессию. Подводка к разнообразию труда.',
            },
          ],
        },
        {
          kind: 'main',
          title: 'Беседа: что важно при выборе',
          duration_min: 17,
          activities: [
            {
              type: 'discussion',
              text: 'Обсуждаем три ориентира: «хочу», «могу», «нужно». Соотносим интересы, способности и востребованность.',
              questions: [
                'Что важнее при выборе профессии — деньги или интерес?',
                'Как понять, к чему есть способности?',
                'Почему любая честная профессия достойна уважения?',
              ],
            },
            {
              type: 'task',
              text: 'Каждый соотносит личное качество с подходящей профессией и поясняет выбор.',
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Мой следующий шаг»',
          duration_min: 7,
          activities: [
            {
              type: 'task',
              text: 'Завершить фразу: «Чтобы приблизиться к своей профессии, я уже сейчас могу…».',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 5–6 классов свести к рассказу о профессиях родителей.',
        harder: 'Для 10–11 классов добавить разбор образовательных траекторий и колледжей/вузов.',
      },
    },
  },
  {
    direction: 'Экологическое',
    grade: 3,
    durationMin: 45,
    format: 'классный час',
    topic: 'Экология и энергосбережение',
    content: {
      title: 'Берегу планету каждый день',
      goals: [
        'Формировать бережное отношение к природе и ресурсам',
        'Учить простым действиям по энергосбережению дома и в школе',
      ],
      materials: ['Картинки «хорошо/плохо для природы»', 'Лист «Эко-обещание»'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Что услышала планета»',
          duration_min: 8,
          activities: [
            {
              type: 'discussion',
              text: 'Учитель зачитывает короткое письмо от имени планеты. Обсуждаем, чем мы можем помочь.',
              questions: ['О чём «попросила» планета?', 'Что происходит, если не беречь природу?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Основная часть: маленькие добрые дела',
          duration_min: 27,
          activities: [
            {
              type: 'game',
              text: 'Сортировка картинок на «полезно/вредно для природы» с объяснением.',
            },
            {
              type: 'discussion',
              text: 'Обсуждаем простые правила: выключать свет и воду, сортировать мусор, беречь бумагу.',
              questions: ['Как сэкономить воду дома?', 'Зачем сортировать мусор?'],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Моё эко-обещание»',
          duration_min: 10,
          activities: [
            {
              type: 'task',
              text: 'Каждый записывает одно эко-обещание и забирает листок домой.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 1–2 классов оставить только сортировку картинок и обещание-рисунок.',
        harder: 'Для 5–6 классов добавить мини-проект «Сколько электричества тратит мой дом».',
      },
    },
  },
  {
    direction: 'Познавательное',
    grade: 8,
    durationMin: 30,
    format: 'квиз',
    topic: 'День российской науки',
    content: {
      title: 'Великие открытия России',
      goals: [
        'Пробудить интерес к науке и достижениям российских учёных',
        'Развивать познавательную активность и командное мышление',
      ],
      materials: ['Слайды с портретами учёных', 'Бланки для команд'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Изобретение вокруг нас»',
          duration_min: 5,
          activities: [
            {
              type: 'discussion',
              text: 'Учитель показывает обычный предмет и спрашивает, какое научное открытие за ним стоит.',
              questions: ['Какие изобретения мы используем каждый день?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Научный квиз',
          duration_min: 18,
          activities: [
            {
              type: 'quiz',
              text: 'Раунды о российских учёных и открытиях: космос, медицина, физика, IT.',
              questions: [
                'Кто открыл периодический закон химических элементов?',
                'Чьё имя связано с первым полётом человека в космос?',
                'Какое российское изобретение изменило мир?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Я бы исследовал…»',
          duration_min: 7,
          activities: [
            {
              type: 'task',
              text: 'Каждый называет область науки, которую хотел бы изучать, и почему.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 3–4 классов упростить вопросы до уровня «знаю/слышал» с картинками.',
        harder: 'Для 10–11 классов добавить раунд о современных научных профессиях.',
      },
    },
  },
  {
    direction: 'Патриотическое',
    grade: 11,
    durationMin: 45,
    format: 'классный час',
    topic: 'День Героев Отечества',
    content: {
      title: 'Подвиг как выбор',
      goals: [
        'Сформировать понимание героизма как осознанного нравственного выбора',
        'Воспитывать уважение к защитникам Отечества и памяти о них',
      ],
      materials: ['Видеоролик о героях', 'Карточки с реальными историями подвигов'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: что такое подвиг сегодня',
          duration_min: 8,
          activities: [
            {
              type: 'video',
              text: 'Просмотр короткого ролика о современных и исторических героях, первичное обсуждение впечатлений.',
              questions: ['Что объединяет этих людей?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Основная часть: разбор историй',
          duration_min: 27,
          activities: [
            {
              type: 'discussion',
              text: 'В группах разбираем реальные истории подвигов; выделяем мотивы и ценности за поступком.',
              questions: [
                'Можно ли назвать подвигом обыденный, но смелый поступок?',
                'Что движет человеком в момент выбора — помочь или пройти мимо?',
                'Как сохранить память о героях?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Мой ориентир»',
          duration_min: 10,
          activities: [
            {
              type: 'task',
              text: 'Каждый формулирует, какое качество героев он хотел бы развивать в себе.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 5–7 классов взять одну понятную историю и обсудить её вместе.',
        harder: 'Для СПО связать тему с профессиональным долгом и ответственностью.',
      },
    },
  },
  {
    direction: 'Гражданское',
    grade: 12,
    durationMin: 30,
    format: 'беседа',
    topic: 'Международный день толерантности',
    content: {
      title: 'Уважение к различиям',
      goals: [
        'Формировать культуру уважительного диалога',
        'Развивать умение понимать и принимать другую точку зрения',
      ],
      materials: ['Кейсы-ситуации', 'Правила уважительного диалога (плакат)'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Мы разные»',
          duration_min: 6,
          activities: [
            {
              type: 'discussion',
              text: 'Короткий опрос-движение: чем мы отличаемся и что у нас общего в группе.',
              questions: ['Хорошо ли, что все люди разные?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Беседа по кейсам',
          duration_min: 17,
          activities: [
            {
              type: 'discussion',
              text: 'Разбор ситуаций конфликта из-за непонимания; ищем уважительное решение.',
              questions: [
                'Где граница между своим мнением и неуважением к другому?',
                'Как вести спор, не переходя на личности?',
                'Что помогает людям договариваться?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Правило диалога»',
          duration_min: 7,
          activities: [
            {
              type: 'task',
              text: 'Группа формулирует одно общее правило уважительного общения для коллектива.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для средних классов взять школьные ситуации и проще сформулировать правила.',
        harder: 'Для студентов СПО связать тему с профессиональной этикой в коллективе.',
      },
    },
  },
  {
    direction: 'Семейные ценности',
    grade: 5,
    durationMin: 60,
    format: 'киноклуб',
    topic: 'Доброта и взаимопомощь',
    content: {
      title: 'Киноклуб: что значит быть добрым',
      goals: [
        'Воспитывать ценность доброты, заботы и взаимопомощи в семье и коллективе',
        'Развивать умение сопереживать и анализировать поступки героев',
      ],
      materials: [
        'Короткометражный фильм (8–10 мин)',
        'Проектор',
        'Карточки с вопросами для обсуждения',
      ],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: настрой на просмотр',
          duration_min: 8,
          activities: [
            {
              type: 'discussion',
              text: 'Перед просмотром обсуждаем, что такое доброта и приведите примеры из жизни.',
              questions: ['Какого человека вы назвали бы добрым?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Просмотр и обсуждение фильма',
          duration_min: 42,
          activities: [
            {
              type: 'video',
              text: 'Просмотр короткометражного фильма о взаимопомощи (учитель заранее подбирает ролик из проверенной коллекции).',
            },
            {
              type: 'discussion',
              text: 'После просмотра обсуждаем поступки героев и их мотивы в малых группах.',
              questions: [
                'Какой поступок героя вам запомнился и почему?',
                'Как доброта одного человека повлияла на других?',
                'Был ли в вашей жизни случай, когда вам помогли?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Доброе дело»',
          duration_min: 10,
          activities: [
            {
              type: 'task',
              text: 'Каждый записывает одно доброе дело, которое сделает для близких на этой неделе.',
            },
          ],
        },
      ],
      adaptations: {
        simpler:
          'Для 1–3 классов выбрать мультфильм и упростить вопросы до «понравилось/не понравилось и почему».',
        harder: 'Для 8–9 классов добавить письменное эссе-отзыв о фильме.',
      },
    },
  },
  {
    direction: 'Познавательное',
    grade: 9,
    durationMin: 40,
    format: 'дебаты',
    topic: 'Безопасный интернет',
    content: {
      title: 'Дебаты: интернет — друг или угроза?',
      goals: [
        'Формировать культуру безопасного поведения в сети',
        'Развивать умение аргументировать позицию и слышать оппонента',
      ],
      materials: [
        'Регламент дебатов',
        'Карточки ролей (команда «за» / команда «против»)',
        'Таймер',
      ],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: правила дебатов',
          duration_min: 6,
          activities: [
            {
              type: 'discussion',
              text: 'Делимся на две команды, знакомимся с регламентом и темой: «Интернет приносит больше пользы или вреда?».',
              questions: ['Что вы делаете в интернете чаще всего?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Раунды дебатов',
          duration_min: 26,
          activities: [
            {
              type: 'discussion',
              text: 'Команды поочерёдно выдвигают аргументы «за» и «против», задают вопросы оппонентам. Учитель — модератор.',
              questions: [
                'Какие риски есть в сети и как их избежать?',
                'Как отличить достоверную информацию от фейка?',
                'Где граница между приватностью и публичностью?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Моё правило сети»',
          duration_min: 8,
          activities: [
            {
              type: 'task',
              text: 'Каждый формулирует одно личное правило безопасного поведения в интернете.',
            },
          ],
        },
      ],
      adaptations: {
        simpler:
          'Для 5–6 классов заменить дебаты на обсуждение по кругу с простыми правилами безопасности.',
        harder: 'Для 10–11 классов добавить разбор реальных кейсов о цифровой репутации.',
      },
    },
  },
  {
    direction: 'Профориентация',
    grade: 10,
    durationMin: 60,
    format: 'проектная сессия',
    topic: 'Профессии будущего',
    content: {
      title: 'Проектная сессия: профессия моей мечты',
      goals: [
        'Развивать осознанное отношение к выбору профессионального пути',
        'Формировать навыки командной проектной работы',
      ],
      materials: ['Ватманы и маркеры', 'Карточки «профессии будущего»', 'Шаблон мини-проекта'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: профессии, которых ещё нет',
          duration_min: 8,
          activities: [
            {
              type: 'discussion',
              text: 'Обсуждаем, как меняется мир труда и какие профессии появятся в ближайшие годы.',
              questions: ['Какие профессии исчезают, а какие появляются?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Работа над проектом в группах',
          duration_min: 42,
          activities: [
            {
              type: 'task',
              text: 'Группы выбирают профессию будущего и готовят мини-проект: какие навыки нужны, чем полезна обществу, как к ней прийти.',
              questions: [
                'Какие навыки будут востребованы всегда?',
                'Как связаны интересы человека и его профессия?',
              ],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Защита проектов и рефлексия',
          duration_min: 10,
          activities: [
            {
              type: 'discussion',
              text: 'Каждая группа коротко представляет проект; завершаем фразой «Чтобы приблизиться к профессии мечты, я начну с…».',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для средних классов сократить до коллажа «профессии вокруг меня».',
        harder: 'Для СПО связать проект с конкретной специальностью и реальным рынком труда.',
      },
    },
  },
  {
    direction: 'Здоровый образ жизни',
    grade: 6,
    durationMin: 40,
    format: 'мастерская',
    topic: 'Мои здоровые привычки',
    content: {
      title: 'Мастерская здоровых привычек',
      goals: [
        'Формировать ценность здорового образа жизни и личной ответственности за здоровье',
        'Учить планировать полезные привычки в режиме дня',
      ],
      materials: ['Шаблон «Колесо дня»', 'Цветные карандаши', 'Стикеры'],
      stages: [
        {
          kind: 'engage',
          title: 'Старт: «Что даёт нам энергию»',
          duration_min: 7,
          activities: [
            {
              type: 'discussion',
              text: 'Обсуждаем, что помогает чувствовать себя бодрым и здоровым.',
              questions: ['Что заряжает тебя энергией с утра?'],
            },
          ],
        },
        {
          kind: 'main',
          title: 'Мастерская: собираем «Колесо дня»',
          duration_min: 25,
          activities: [
            {
              type: 'task',
              text: 'Каждый составляет своё «колесо дня» с полезными привычками: сон, движение, питание, отдых, учёба.',
              questions: ['Каких привычек тебе не хватает?', 'Что можно изменить уже завтра?'],
            },
          ],
        },
        {
          kind: 'reflection',
          title: 'Рефлексия: «Одна привычка»',
          duration_min: 8,
          activities: [
            {
              type: 'task',
              text: 'Каждый выбирает одну привычку и приклеивает стикер-обещание на общий плакат класса.',
            },
          ],
        },
      ],
      adaptations: {
        simpler: 'Для 1–3 классов заменить «колесо дня» на рисунок одного полезного дела.',
        harder: 'Для 8–9 классов добавить трекер привычек на неделю.',
      },
    },
  },
]

async function main() {
  const { db } = await import('@/db')
  const { users, scenarios, sharedScenarios } = await import('@/db/schema')
  const { embed } = await import('@/lib/gigachat/embeddings')

  // 1) seed-владелец источников (не для логина — случайный пароль)
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_EMAIL))
    .limit(1)
  let userId: string
  if (found) {
    userId = found.id
    console.log(`Seed-владелец уже есть: ${SEED_EMAIL} (id=${userId})`)
  } else {
    const passwordHash = await hashPassword(randomBytes(24).toString('hex'))
    const [createdUser] = await db
      .insert(users)
      .values({ email: SEED_EMAIL, name: 'Библиотека сообщества', passwordHash })
      .returning({ id: users.id })
    if (!createdUser) throw new Error('не удалось создать seed-владельца')
    userId = createdUser.id
    console.log(`Создан seed-владелец: ${SEED_EMAIL} (id=${userId})`)
  }

  let created = 0
  let skipped = 0
  for (const item of LIBRARY) {
    // валидация контента по схеме (как на проде)
    const parsed = scenarioContentSchema.safeParse(item.content)
    if (!parsed.success) {
      console.warn(`SKIP (schema) "${item.topic}": ${parsed.error.issues[0]?.message}`)
      continue
    }

    // идемпотентность источника по (userId, direction, grade, format, topic)
    const [existingSrc] = await db
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(
        and(
          eq(scenarios.userId, userId),
          eq(scenarios.direction, item.direction),
          eq(scenarios.grade, item.grade),
          eq(scenarios.format, item.format),
          eq(scenarios.topic, item.topic),
        ),
      )
      .limit(1)

    let scenarioId = existingSrc?.id
    if (!scenarioId) {
      const [src] = await db
        .insert(scenarios)
        .values({
          userId,
          title: item.content.title,
          direction: item.direction,
          grade: item.grade,
          durationMin: item.durationMin,
          format: item.format,
          topic: item.topic,
          content: item.content,
          inputContext: {
            direction: item.direction as never,
            grade: item.grade,
            topic: item.topic,
            durationMin: item.durationMin,
            format: item.format as never,
          },
        })
        .returning({ id: scenarios.id })
      if (!src) throw new Error(`insert сценария не вернул id для "${item.topic}"`)
      scenarioId = src.id
    }

    // уже в библиотеке?
    const [existingShared] = await db
      .select({ id: sharedScenarios.id })
      .from(sharedScenarios)
      .where(eq(sharedScenarios.sourceScenarioId, scenarioId))
      .limit(1)
    if (existingShared) {
      skipped++
      console.log(`= уже в библиотеке: "${item.topic}"`)
      continue
    }

    // строгий PII-чек (как кнопка «Поделиться»)
    const check = strictPiiCheck(item.content)
    if (!check.clean) {
      const kinds = Array.from(new Set(check.remaining.map((m) => m.type))).join(', ')
      console.warn(`SKIP (PII: ${kinds}) "${item.topic}"`)
      continue
    }

    // эмбеддинг для семантического поиска
    let vec: number[] | null = null
    try {
      const text = `${item.direction} ${item.topic} ${check.anonymized.title}`
      const [v] = await embed([text])
      vec = v ?? null
    } catch (e) {
      console.error(`embedding failed "${item.topic}" (non-fatal):`, e)
    }

    const [row] = await db
      .insert(sharedScenarios)
      .values({
        sourceScenarioId: scenarioId,
        anonymizedContent: check.anonymized,
        direction: item.direction,
        grade: item.grade,
        durationMin: item.durationMin,
        format: item.format,
        topic: item.topic,
        likeCount: 1,
      })
      .returning({ id: sharedScenarios.id })

    if (vec && row) {
      const { sql } = await import('drizzle-orm')
      await db.execute(
        sql`UPDATE shared_scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${row.id}`,
      )
    }
    created++
    console.log(
      `+ в библиотеку: "${item.topic}" (${item.direction}, кл.${item.grade}, ${item.format})`,
    )
  }

  console.log(
    `\nИтого: добавлено ${created}, пропущено ${skipped}, всего записей в LIBRARY=${LIBRARY.length}`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
