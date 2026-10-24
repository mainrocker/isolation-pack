// priority: 80
// Map markers live in the world save (server persistent data), so a map carries its own setup.
//
//   /isolation mark <type> [sector] [pos]          lobby, human_spawn, alien_spawn, station, loot, pod, joe_spawn, map_station
//   /isolation mark objective <id> [sector] [pos]  mission points, ids listed in missions.js
//   /isolation mark list | remove | show
//   /isolation bulkhead <sector> <from> <to>       blocked off when that sector is closed
//   /isolation bulkhead list | clear
//   /isolation check

const MARK_TYPES = ['lobby', 'human_spawn', 'alien_spawn', 'station', 'loot', 'pod', 'joe_spawn', 'map_station']
const MARKS_KEY = 'isolation_marks'

function loadMarks(server) {
  const raw = String(server.persistentData.getString(MARKS_KEY))
  if (!raw) return { points: [], bulkheads: [] }
  const data = JSON.parse(raw)
  if (!data.points) data.points = []
  if (!data.bulkheads) data.bulkheads = []
  return data
}

function saveMarks(server, data) {
  server.persistentData.putString(MARKS_KEY, JSON.stringify(data))
}

function marksOf(data, type, sectors) {
  return data.points.filter(m => m.type === type && (!sectors || sectors.indexOf(m.sector) >= 0))
}

function allSectors(data) {
  const out = []
  data.points.forEach(m => { if (out.indexOf(m.sector) < 0) out.push(m.sector) })
  data.bulkheads.forEach(b => { if (out.indexOf(b.sector) < 0) out.push(b.sector) })
  return out
}

// a map can bring its own table (FEARLESS closes decks); otherwise config.js decides. More humans
// than the table goes up to get its biggest entry, so a deck it never lists (A deck) never opens
function openSectorsFor(data, humans) {
  const table = data.sectorsByHumans || CFG.sectorsByHumans
  const keys = Object.keys(table).map(k => parseInt(k)).sort((a, b) => a - b)
  for (const k of keys) {
    if (humans <= k) return table[k]
  }
  return keys.length > 0 ? table[keys[keys.length - 1]] : allSectors(data)
}

function setBulkheads(server, data, openSectors) {
  data.bulkheads.forEach(b => {
    const box = `${b.from[0]} ${b.from[1]} ${b.from[2]} ${b.to[0]} ${b.to[1]} ${b.to[2]}`
    if (openSectors && openSectors.indexOf(b.sector) < 0) {
      cmd(server, `fill ${box} ${CFG.bulkheadBlock} replace air`)
    } else {
      cmd(server, `fill ${box} air replace ${CFG.bulkheadBlock}`)
    }
  })
}

function markLabel(m) {
  return `${m.type}${m.id ? ':' + m.id : ''} [${m.sector}] ${m.pos[0]} ${m.pos[1]} ${m.pos[2]}`
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event

  const addMark = (ctx, type, id, sector, pos) => {
    const server = ctx.source.server
    let p = pos
    if (!p) {
      let player = ctx.source.player
      if (!player) {
        ctx.source.sendFailure(Text.of('Give a position when running from the console'))
        return 0
      }
      p = [Math.floor(player.x), Math.floor(player.y), Math.floor(player.z)]
    }
    const data = loadMarks(server)
    const mark = { type: type, sector: sector || 'core', pos: p }
    if (id) mark.id = id
    data.points.push(mark)
    saveMarks(server, data)
    ctx.source.sendSuccess(Text.of(`Added ${markLabel(mark)}`), true)
    return 1
  }

  const blockPos = (ctx, name) => {
    const bp = Arguments.BLOCK_POS.getResult(ctx, name)
    return [bp.x, bp.y, bp.z]
  }

  // [sector] [pos] tail shared by every mark type
  const withSectorAndPos = (node, type, idArg) => {
    const id = ctx => idArg ? String(Arguments.WORD.getResult(ctx, idArg)) : null
    const sector = ctx => String(Arguments.WORD.getResult(ctx, 'sector'))
    return node
      .executes(ctx => addMark(ctx, type, id(ctx), null, null))
      .then(Commands.argument('sector', Arguments.WORD.create(event))
        .executes(ctx => addMark(ctx, type, id(ctx), sector(ctx), null))
        .then(Commands.argument('pos', Arguments.BLOCK_POS.create(event))
          .executes(ctx => addMark(ctx, type, id(ctx), sector(ctx), blockPos(ctx, 'pos')))))
  }

  let markNode = Commands.literal('mark')
  for (const type of MARK_TYPES) {
    markNode = markNode.then(withSectorAndPos(Commands.literal(type), type, null))
  }
  markNode = markNode.then(Commands.literal('objective')
    .then(withSectorAndPos(Commands.argument('id', Arguments.WORD.create(event)), 'objective', 'id')))

  markNode = markNode
    .then(Commands.literal('list').executes(ctx => {
      const data = loadMarks(ctx.source.server)
      if (data.points.length === 0) ctx.source.sendSystemMessage(Text.of('No marks yet'))
      data.points.forEach((m, i) => ctx.source.sendSystemMessage(Text.of(`#${i} ${markLabel(m)}`)))
      return data.points.length
    }))
    .then(Commands.literal('remove').executes(ctx => {
      const player = ctx.source.player
      if (!player) return 0
      const server = ctx.source.server
      const data = loadMarks(server)
      const before = data.points.length
      data.points = data.points.filter(m => dist(m.pos[0] + 0.5, m.pos[1], m.pos[2] + 0.5, player.x, player.y, player.z) > 3)
      saveMarks(server, data)
      const removed = before - data.points.length
      ctx.source.sendSuccess(Text.of(`Removed ${removed} mark(s) within 3 blocks`), true)
      return removed
    }))
    .then(Commands.literal('show').executes(ctx => {
      const player = ctx.source.player
      if (!player) return 0
      const server = ctx.source.server
      const data = loadMarks(server)
      for (let i = 0; i < 10; i++) {
        later(i, () => {
          data.points.forEach(m => {
            cmd(server, `particle minecraft:happy_villager ${m.pos[0] + 0.5} ${m.pos[1] + 1} ${m.pos[2] + 0.5} 0.2 0.6 0.2 0 8 force ${player.username}`)
          })
        })
      }
      return 1
    }))

  const bulkheadNode = Commands.literal('bulkhead')
    .then(Commands.literal('list').executes(ctx => {
      const data = loadMarks(ctx.source.server)
      if (data.bulkheads.length === 0) ctx.source.sendSystemMessage(Text.of('No bulkheads yet'))
      data.bulkheads.forEach((b, i) => ctx.source.sendSystemMessage(Text.of(`#${i} [${b.sector}] ${b.from.join(' ')} -> ${b.to.join(' ')}`)))
      return data.bulkheads.length
    }))
    .then(Commands.literal('clear').executes(ctx => {
      const server = ctx.source.server
      const data = loadMarks(server)
      setBulkheads(server, data, null)
      data.bulkheads = []
      saveMarks(server, data)
      ctx.source.sendSuccess(Text.of('Bulkheads cleared'), true)
      return 1
    }))
    .then(Commands.argument('sector', Arguments.WORD.create(event))
      .then(Commands.argument('from', Arguments.BLOCK_POS.create(event))
        .then(Commands.argument('to', Arguments.BLOCK_POS.create(event))
          .executes(ctx => {
            const server = ctx.source.server
            const data = loadMarks(server)
            const b = {
              sector: String(Arguments.WORD.getResult(ctx, 'sector')),
              from: blockPos(ctx, 'from'),
              to: blockPos(ctx, 'to'),
            }
            data.bulkheads.push(b)
            saveMarks(server, data)
            ctx.source.sendSuccess(Text.of(`Bulkhead for sector ${b.sector} added`), true)
            return 1
          }))))

  const checkNode = Commands.literal('check').executes(ctx => {
    const data = loadMarks(ctx.source.server)
    const problems = []
    for (const type of ['human_spawn', 'alien_spawn', 'pod']) {
      if (marksOf(data, type).length === 0) problems.push(`no ${type} mark`)
    }
    const objectives = marksOf(data, 'objective')
    if (objectives.length < CFG.missionSteps.solo[0]) problems.push(`only ${objectives.length} objective mark(s)`)
    objectives.forEach(m => {
      if (!missionById(m.id)) problems.push(`unknown objective id "${m.id}"`)
    })
    if (marksOf(data, 'lobby').length === 0) problems.push('no lobby mark (players stay where they are after a round)')
    ctx.source.sendSystemMessage(Text.of(`Sectors: ${allSectors(data).join(', ') || 'none'}`))
    if (problems.length === 0) ctx.source.sendSystemMessage(Text.of('Map looks ready'))
    problems.forEach(p => ctx.source.sendSystemMessage(Text.of(`- ${p}`)))
    return problems.length === 0 ? 1 : 0
  })

  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(markNode)
      .then(bulkheadNode)
      .then(checkNode)
  )
})
