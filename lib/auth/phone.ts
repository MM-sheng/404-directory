export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "")
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value).replace(/\+/g, "")
  return digits.length >= 8 && digits.length <= 15 && /^\d+$/.test(digits)
}

export function displayPhone(value: string): string {
  return normalizePhone(value)
}
