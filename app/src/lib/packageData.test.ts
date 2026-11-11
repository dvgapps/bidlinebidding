import { describe, expect, it } from 'vitest'
import { awardKey, nextBidId, packageKeys } from './packageData'

describe('what belongs to a bid package', () => {
  it('lists every saved document of a package, so deleting it leaves nothing behind', () => {
    expect(packageKeys('2701')).toEqual(['work:2701:captain', 'work:2701:firstOfficer', 'dates:2701', 'carry:2701', 'award:2701'])
    expect(awardKey('2702')).toBe('award:2702')
  })
  it('finds the next stored bid period', () => {
    expect(nextBidId(['2613', '2701', '2702'], '2701')).toBe('2702')
    expect(nextBidId(['2613', '2701'], '2701')).toBeNull()
    expect(nextBidId(['2702', '2613'], '2613')).toBe('2702')
  })
})
