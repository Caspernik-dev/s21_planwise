import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-neutral-900">Добро пожаловать</h1>
      <p className="text-neutral-600 max-w-prose">
        Здесь появится создание сценариев, библиотека сообщества, календарь и загруженные планы.
        Сейчас — фундамент готов.
      </p>
      <Card>
        <CardHeader><CardTitle>Скоро</CardTitle></CardHeader>
        <CardContent className="text-sm text-neutral-600">
          <ul className="list-disc pl-5 space-y-1">
            <li>Генератор сценариев классных часов и квизов</li>
            <li>Загрузка плана воспитательной работы</li>
            <li>Библиотека сообщества</li>
            <li>Экспорт в PDF / DOCX</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
