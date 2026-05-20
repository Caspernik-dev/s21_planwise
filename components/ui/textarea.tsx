import { cn } from '@/lib/utils'
import * as React from 'react'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md bg-neutral-0 px-3 py-2 text-sm text-neutral-900 ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 min-h-[72px] resize-y',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
