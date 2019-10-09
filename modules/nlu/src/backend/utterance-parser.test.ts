import { extractSlots, parseUtterance } from './utterance-parser'

test('extract slots from utterance', () => {
  const utterance = 'My name is [Kanye](me) and your name is [Jay](you)'
  //                .01234567890123456789012345678901234567890123456789.
  const extracted = extractSlots(utterance)
  expect(extracted.length).toEqual(2)
  expect(extracted[0][0]).toEqual('[Kanye](me)')
  expect(extracted[0][1]).toEqual('Kanye')
  expect(extracted[0][2]).toEqual('me')
  expect(extracted[0].index).toEqual(11)
  expect(extracted[1][0]).toEqual('[Jay](you)')
  expect(extracted[1][1]).toEqual('Jay')
  expect(extracted[1][2]).toEqual('you')
  expect(extracted[1].index).toEqual(40)
})

describe('parse utterance', () => {
  test('empty', () => {
    const res = parseUtterance('')

    expect(res.utterance).toEqual('')
    expect(res.parsedSlots).toEqual([])
  })

  test('no slots', () => {
    const utterance = 'No one is safe, trust anyone but you.'

    const res = parseUtterance(utterance)
    expect(res.utterance).toEqual(utterance)
    expect(res.parsedSlots).toEqual([])
  })

  test('single slot', () => {
    const utterance = 'Brace yourself [Alex](you), big stuff coming.'
    // raw            .01234567890123456789012345678901234567890123.
    // clean          .012345678901234.5678......90.1.....234567890.
    const res = parseUtterance(utterance)

    expect(res.utterance).toEqual('Brace yourself Alex, big stuff coming.')
    expect(res.parsedSlots.length).toEqual(1)
    expect(res.parsedSlots[0].name).toEqual('you')
    expect(res.parsedSlots[0].value).toEqual('Alex')
    expect(res.parsedSlots[0].rawPosition).toEqual({ start: 15, end: 26 })
    expect(res.parsedSlots[0].cleanPosition).toEqual({ start: 15, end: 19 })
  })

  test('multiple slots', () => {
    const utterance = 'My name is [Kanye](me) and your name is [Jay](you)'
    // raw            .01234567890123456789012345678901234567890123456789.
    // clean          .01234567890.12345.....678901234567890123.456.......
    const res = parseUtterance(utterance)
    expect(res.utterance).toEqual('My name is Kanye and your name is Jay')
    expect(res.parsedSlots.length).toEqual(2)
    expect(res.parsedSlots[0].name).toEqual('me')
    expect(res.parsedSlots[0].value).toEqual('Kanye')
    expect(res.parsedSlots[0].rawPosition).toEqual({ start: 11, end: 22 })
    expect(res.parsedSlots[0].cleanPosition).toEqual({ start: 11, end: 16 })
    expect(res.parsedSlots[1].name).toEqual('you')
    expect(res.parsedSlots[1].value).toEqual('Jay')
    expect(res.parsedSlots[1].rawPosition).toEqual({ start: 40, end: 50 })
    expect(res.parsedSlots[1].cleanPosition).toEqual({ start: 34, end: 37 })
  })
})
