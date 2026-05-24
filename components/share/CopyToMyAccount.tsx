'use client'

import { copyScenarioByTokenAction } from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { useTransition } from 'react'

export function CopyToMyAccount({ token }: { token: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await copyScenarioByTokenAction(token)
        })
      }
    >
      {pending ? 'Копируем…' : 'Скопировать себе'}
    </Button>
  )
}
