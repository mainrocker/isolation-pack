// priority: 5
// /isolation dev teststation  builds a 3x3 grid of rooms around 0 100 0 and REPLACES all marks.
// Columns are sectors: x=-20 west, x=0 core, x=20 east. Good enough to test a round
// before the real map is in.

const TEST_CENTERS = [-20, 0, 20]
const TEST_SECTOR = { '-20': 'west', '0': 'core', '20': 'east' }

function buildTestStation(server) {
  const c = s => cmd(server, s)
  c('forceload add -32 -32 32 32')
  c('fill -26 99 -26 26 105 26 minecraft:gray_concrete')
  c('fill -26 99 -26 26 99 26 minecraft:polished_andesite')

  TEST_CENTERS.forEach(cx => TEST_CENTERS.forEach(cz => {
    c(`fill ${cx - 4} 100 ${cz - 4} ${cx + 4} 103 ${cz + 4} air`)
    c(`setblock ${cx} 103 ${cz} minecraft:light[level=6]`)
  }))
  // corridors, every neighbour connected so there are loops
  TEST_CENTERS.forEach(cz => [-20, 0].forEach(cx => {
    c(`fill ${cx + 5} 100 ${cz - 1} ${cx + 15} 102 ${cz + 1} air`)
    c(`setblock ${cx + 10} 102 ${cz} minecraft:light[level=3]`)
  }))
  TEST_CENTERS.forEach(cx => [-20, 0].forEach(cz => {
    c(`fill ${cx - 1} 100 ${cz + 5} ${cx + 1} 102 ${cz + 15} air`)
    c(`setblock ${cx} 102 ${cz + 10} minecraft:light[level=3]`)
  }))
  // doors on the core -> east corridors
  TEST_CENTERS.forEach(cz => {
    c(`fill 10 100 ${cz - 1} 10 102 ${cz + 1} minecraft:gray_concrete`)
    c(`setblock 10 100 ${cz} minecraft:dark_oak_door[facing=east,half=lower]`)
    c(`setblock 10 101 ${cz} minecraft:dark_oak_door[facing=east,half=upper]`)
  })

  // lobby box above
  c('fill -3 110 -3 3 114 3 minecraft:glass')
  c('fill -2 111 -2 2 113 2 air')
  c('fill -2 110 -2 2 110 2 minecraft:white_concrete')

  const points = []
  const mark = (type, x, z, extra) => {
    const m = { type: type, sector: TEST_SECTOR[String(Math.round(x / 20) * 20)] || 'core', pos: [x, 100, z] }
    if (extra) m.id = extra
    points.push(m)
    return m
  }
  points.push({ type: 'lobby', sector: 'core', pos: [0, 111, 0] })

  mark('joe_spawn', 20, 20)
  mark('human_spawn', -20, -20)
  mark('human_spawn', 0, -20)
  mark('human_spawn', 20, -20)
  mark('alien_spawn', 0, 20)

  const objectives = [['security', 0, -20], ['reactor', 0, 0], ['medical', 20, 0], ['airlock', 20, 20], ['comms', -20, 0], ['tram', -20, -20]]
  objectives.forEach(o => {
    mark('objective', o[1] + 3, o[2] + 3, o[0])
    c(`setblock ${o[1] + 3} 100 ${o[2] + 3} minecraft:lodestone`)
  })
  ;[[20, 20], [-20, 20]].forEach(r => {
    mark('pod', r[0] + 3, r[1] - 3)
    c(`setblock ${r[0] + 3} 100 ${r[1] - 3} minecraft:beacon`)
  })
  ;[[0, 0], [20, -20], [-20, 0]].forEach(r => {
    mark('station', r[0] - 3, r[1] + 3)
    c(`setblock ${r[0] - 3} 100 ${r[1] + 3} minecraft:respawn_anchor`)
  })
  TEST_CENTERS.forEach(cx => TEST_CENTERS.forEach(cz => {
    mark('loot', cx - 3, cz - 3)
    mark('loot', cx + 2, cz)
    mark('loot', cx - 2, cz - 1)
  }))

  // a crawl duct in the ceiling from the core room to the reactor, with grates to drop out of
  c('fill 2 103 -21 2 103 1 minecraft:gray_concrete')
  c('fill 2 104 -20 2 104 0 air')
  c('setblock 2 103 -20 isolation:vent_grate[facing=down]')
  c('setblock 2 103 0 isolation:vent_grate[facing=down]')
  // and a low wall vent that runs behind the core room's west wall, a way in and a way out
  c('fill -6 100 -17 -6 100 -10 air')
  c('setblock -5 100 -17 isolation:vent_grate[facing=east]')
  c('setblock -5 100 -10 isolation:vent_grate[facing=east]')

  // doors that need tools: jammed between security and the reactor, keypad on the way from
  // medical to the airlock, sealed between the reactor and the south room
  const door = (x, z, axis, lock) => {
    const facing = axis === 'z' ? 'south' : 'east'
    if (axis === 'z') c(`fill ${x - 1} 100 ${z} ${x + 1} 102 ${z} minecraft:gray_concrete`)
    else c(`fill ${x} 100 ${z - 1} ${x} 102 ${z + 1} minecraft:gray_concrete`)
    c(`setblock ${x} 100 ${z} isolation:station_door[facing=${facing},half=lower,lock=${lock}]`)
    c(`setblock ${x} 101 ${z} isolation:station_door[facing=${facing},half=upper,lock=${lock}]`)
  }
  door(0, -10, 'z', 'jammed')
  door(20, 10, 'z', 'keypad')
  door(0, 10, 'z', 'sealed')

  // a panel to pry open, and a rewire station in the reactor room with things to switch
  c('setblock 2 101 -24 isolation:maintenance_panel[facing=south]')
  c('setblock -4 101 2 isolation:rewire_station[facing=east]')
  c('setblock 0 103 0 minecraft:air')
  c('setblock 1 103 1 isolation:station_light')
  c('setblock -1 103 -1 isolation:station_light[flickers=true]')
  c('setblock -3 103 3 isolation:emergency_light')
  c('setblock 3 103 -3 isolation:smoke_vent')
  c('setblock 3 103 -20 isolation:alarm_speaker')

  const bulkheads = TEST_CENTERS.map(cz => ({ sector: 'west', from: [-10, 100, cz - 1], to: [-10, 102, cz + 1] }))
  saveMarks(server, { points: points, bulkheads: bulkheads })
  return points.length
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event
  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(Commands.literal('dev')
        .then(Commands.literal('teststation').executes(ctx => {
          if (roundActive()) {
            ctx.source.sendFailure(Text.of('Stop the round first'))
            return 0
          }
          const n = buildTestStation(ctx.source.server)
          ctx.source.sendSuccess(Text.of(`Test station built at 0 100 0, ${n} marks set. Lobby at 0 111 0.`), true)
          return 1
        }))
        .then(Commands.literal('gotostep')
          .then(Commands.argument('player', Arguments.PLAYER.create(event)).executes(safely(ctx => {
            const step = roundActive() ? currentStep(R) : null
            if (!step) {
              ctx.source.sendFailure(Text.of('No current step'))
              return 0
            }
            const p = Arguments.PLAYER.getResult(ctx, 'player')
            const pos = step.mark.pos
            cmd(ctx.source.server, `tp ${p.username} ${pos[0] + 1.5} ${pos[1]} ${pos[2] + 0.5}`)
            ctx.source.sendSystemMessage(Text.of(`${p.username} -> ${step.mission.id}`))
            return 1
          }))))
        .then(Commands.literal('debug').executes(safely(ctx => {
          const src = ctx.source
          src.sendSystemMessage(Text.of(`alien hud: ${JSON.stringify(ALIEN_HUD)}`))
          src.sendSystemMessage(Text.of(`noise: ${JSON.stringify(NOISE_SCORE)}`))
          src.sendSystemMessage(Text.of(`round: t=${R.t} step=${R.stepIndex} progress=${R.progress} pod=${R.podTimer} lastKill=${R.lastKill} hints=${JSON.stringify(R.hints || {})}`))
          playersOf(src.server).forEach(p => {
            const h = R.humans ? R.humans[String(p.username)] : null
            src.sendSystemMessage(Text.of(`${p.username}: ${roleOf(p)} ${Math.round(p.x)} ${Math.round(p.y)} ${Math.round(p.z)} crouch=${p.isCrouching()} spec=${p.isSpectator()} alive=${p.isAlive()} hp=${p.health} status=${h ? h.status : '-'}`))
          })
          return 1
        }))))
  )
})
