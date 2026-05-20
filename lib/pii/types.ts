export type PiiType = 'phone' | 'email' | 'snils' | 'passport' | 'inn' | 'dob' | 'address' | 'name'

export interface PiiMatch {
  type: PiiType
  value: string
  start: number
  end: number
}

export interface AnonymizeResult {
  text: string
  replacements: Array<{ type: PiiType; original: string; placeholder: string }>
}
