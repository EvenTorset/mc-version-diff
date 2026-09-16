export const VERSION_TIPS = {
  released: 'When this version was published by Mojang.',
  type: 'Release versions are the finished updates. Snapshots are the weekly previews of the next one.',
  files: 'How many files the version holds, counting everything the comparison looks at.',
}

export function daysApart(a: string, b: string) {
  const days = Math.round(Math.abs(new Date(b).valueOf() - new Date(a).valueOf()) / 86400000)
  return days === 0 ? 'same day' : days === 1 ? '1 day apart' : `${days} days apart`
}
