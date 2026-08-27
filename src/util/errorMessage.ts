export function errorMessage(err: any): string {
  return err?.message ?? err?.toString?.() ?? 'Unknown error.'
}
