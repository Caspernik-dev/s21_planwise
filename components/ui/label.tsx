import { cn } from '@/lib/utils'
import * as React from 'react'

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is provided by consumers via {...props}
  <label ref={ref} className={cn('text-sm font-medium text-neutral-700', className)} {...props} />
))
Label.displayName = 'Label'
