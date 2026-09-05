import type { DeltaTrack } from '@/delta_providers'

export type Shell = 'bash' | 'powershell' | 'cmd'

function getDirName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  parts.pop()
  return parts.join('/')
}

function toWinPath(filePath: string): string {
  return filePath.replace(/\//g, '\\')
}

export function generateMoveScript(tracks: DeltaTrack[], format: Shell): string {
  switch (format) {
    case 'bash':
      return generateBashScript(tracks)
    case 'powershell':
      return generatePowerShellScript(tracks)
    case 'cmd':
      return generateBatchScript(tracks)
  }
}

function generateBashScript(tracks: DeltaTrack[]): string {
  const lines = ['#!/usr/bin/env bash', '']

  for (const { a, b } of tracks) {
    const dir = getDirName(b)
    if (dir) {
      lines.push(`if [ -f "${a}" ]; then mkdir -p "${dir}" && mv "${a}" "${b}" 2>/dev/null; fi`)
    } else {
      lines.push(`if [ -f "${a}" ]; then mv "${a}" "${b}" 2>/dev/null; fi`)
    }
  }

  return lines.join('\n')
}

function generatePowerShellScript(tracks: DeltaTrack[]): string {
  const lines: string[] = []

  for (const { a, b } of tracks) {
    const winA = toWinPath(a)
    const winB = toWinPath(b)
    const winDir = toWinPath(getDirName(b))

    if (winDir) {
      lines.push(
        `if (Test-Path -LiteralPath "${winA}") { ` +
        `New-Item -ItemType Directory -Force -Path "${winDir}" | Out-Null; ` +
        `Move-Item -LiteralPath "${winA}" -Destination "${winB}" -ErrorAction SilentlyContinue }`
      )
    } else {
      lines.push(
        `if (Test-Path -LiteralPath "${winA}") { ` +
        `Move-Item -LiteralPath "${winA}" -Destination "${winB}" -ErrorAction SilentlyContinue }`
      )
    }
  }

  return lines.join('\n')
}

function generateBatchScript(tracks: DeltaTrack[]): string {
  const lines = ['@echo off', '']

  for (const { a, b } of tracks) {
    const winA = toWinPath(a)
    const winB = toWinPath(b)
    const winDir = toWinPath(getDirName(b))

    if (winDir) {
      lines.push(`mkdir "${winDir}" 2>nul & move /Y "${winA}" "${winB}" >nul 2>&1`)
    } else {
      lines.push(`move /Y "${winA}" "${winB}" >nul 2>&1`)
    }
  }

  return lines.join('\n')
}

export function generateMoveCommand(tracks: DeltaTrack[], format: Shell): string {
  switch (format) {
    case 'bash':
      return tracks
        .map(({ a, b }) => {
          const dir = getDirName(b)
          const mkdir = dir ? `mkdir -p "${dir}" && ` : ''
          return `[ -f "${a}" ] && ${mkdir}mv "${a}" "${b}" 2>/dev/null`
        })
        .join('; ')

    case 'powershell':
      return tracks
        .map(({ a, b }) => {
          const winA = toWinPath(a)
          const winB = toWinPath(b)
          const winDir = toWinPath(getDirName(b))
          const mkdir = winDir ? `New-Item -ItemType Directory -Force -Path "${winDir}" | Out-Null; ` : ''
          return `if (Test-Path -LiteralPath "${winA}") { ${mkdir}Move-Item -LiteralPath "${winA}" -Destination "${winB}" -ErrorAction SilentlyContinue }`
        })
        .join('; ')

    case 'cmd':
      return tracks
        .map(({ a, b }) => {
          const winA = toWinPath(a)
          const winB = toWinPath(b)
          const winDir = toWinPath(getDirName(b))
          const mkdir = winDir ? `mkdir "${winDir}" 2>nul & ` : ''
          return `${mkdir}move /Y "${winA}" "${winB}" >nul 2>&1`
        })
        .join(' & ')
  }
}
