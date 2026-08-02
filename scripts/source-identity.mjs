import { execFileSync } from 'node:child_process'

export function readSourceIdentity() {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8'
  })
  if (status) {
    const entries = status.trim().split('\n').slice(0, 32)
    throw new Error(`Release artifacts require a clean source worktree: ${JSON.stringify(entries)}`)
  }

  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    timestamp: execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
  }
}
