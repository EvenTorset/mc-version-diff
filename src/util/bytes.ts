const K = 1024

export function formatBytes(bytes: number | null, decimals: number = 2): string {
  if (bytes === 0 || bytes === null) return '0 B'
  if (bytes < 0) return `-${formatBytes(Math.abs(bytes), decimals)}`

  const units = ['B', 'kB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(K))
  const unitIndex = Math.min(i, units.length - 1)
  const value = bytes / Math.pow(K, unitIndex)

  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)

  return `${formattedValue} ${units[unitIndex]}`
}

export function parseBytes(input: string): number {
  const m = input.match(/^\s*(.+?)\s*([kmgt]?b)?\s*$/i)
  if (m === null) return NaN
  const i = ['b', 'kb', 'mb', 'gb', 'tb'].indexOf(m[2]?.toLowerCase())
  if (i === -1) return Number(m[1])
  return Number(m[1]) * K ** i
}
