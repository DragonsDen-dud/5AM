/**
 * Honor verification — the weakest method, available only as a manual Settings
 * override. The typed confirmation exists to add just enough friction that
 * logging a run you did not do has to be a deliberate act rather than an
 * impulse tap (spec §3.3).
 */

export const CONFIRM_WORD = 'RAN'

export function isConfirmed(input: string): boolean {
  return input.trim().toUpperCase() === CONFIRM_WORD
}
