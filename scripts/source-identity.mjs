import { execFileSync } from 'node:child_process'

export function readSourceIdentity() {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8'
  })
  if (status) {
    throw new Error('Release artifacts require a clean source worktree')
  }

  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    timestamp: execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
  }
}
