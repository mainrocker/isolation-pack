// priority: 10
// Round loop: lobby -> countdown -> running -> ended -> lobby.
//
//   /isolation start    roles are kept; anyone without one becomes human, and if nobody
//                       is the alien one is picked at random. Spectator-mode players sit out.
//   /isolation stop     ends the round with no winner
//   /isolation status
//
// Round state is lost on /kubejs reload, so stop the round before reloading scripts.

let R = { phase: 'lobby' }

const ROUND_RULES = {
  naturalRegeneration: false,
  keepInventory: true,
  doImmediateRespawn: true,
  showDeathMessages: false,
  doDaylightCycle: false,
  doWeatherCycle: false,
  doMobSpawning: false,
  doPatrolSpawning: false,
  doTraderSpawning: false,
  doInsomnia: false,
  announceAdvancements: false,
  reducedDebugInfo: true,
  doFireTick: false,
}

function roundRunning() {
  return R.phase === 'running'
}

function roundActive() {
  return R.phase === 'countdown' || R.phase === 'running'
}

function livingHumans(server) {
  if (!R.humans) return []
  return playersOf(server).filter(p => {
    const h = R.humans[String(p.username)]
    return h && h.status === 'alive' && !p.isSpectator()
  })
}

function applyEffects(server, name, effects) {
  effects.forEach(e => cmd(server, `effect give ${name} ${e[0]} infinite ${e[1]} true`))
}

function timeLeft() {
  return R.length - Math.max(0, R.t - CFG.countdown)
}

function startRound(server) {
  if (R.phase !== 'lobby') return 'A round is already running'
  loadSettings()
  const data = loadMarks(server)
  const players = playersOf(server).filter(p => !p.isSpectator())

  if (!players.some(p => isAlien(p))) {
    let alienCount = players.length >= CFG.twoAliensAt ? 2 : 1
    shuffle(players).slice(0, alienCount).forEach(p => setRole(p, ALIEN_TEAM))
  }
  players.forEach(p => { if (!isAlien(p)) setRole(p, HUMAN_TEAM) })

  const aliens = players.filter(p => isAlien(p))
  const humans = players.filter(p => isHuman(p))
  if (aliens.length === 0 || humans.length === 0) return 'Need at least one alien and one human'

  const solo = humans.length === 1
  const sectors = openSectorsFor(data, humans.length)
  const humanSpawns = marksOf(data, 'human_spawn', sectors)
  const alienSpawns = marksOf(data, 'alien_spawn', sectors)
  if (humanSpawns.length === 0) return `No human_spawn mark in open sectors (${sectors.join(', ')})`
  if (alienSpawns.length === 0) return `No alien_spawn mark in open sectors (${sectors.join(', ')})`
  if (marksOf(data, 'pod', sectors).length === 0) return `No pod mark in open sectors (${sectors.join(', ')})`

  R = {
    phase: 'countdown',
    solo: solo,
    sectors: sectors,
    steps: planMissions(data, sectors, solo),
    stepIndex: 0,
    progress: 0,
    stations: marksOf(data, 'station', sectors),
    humans: {},
    aliens: aliens.map(p => String(p.username)),
    t: 0,
    length: (solo ? CFG.roundMinutes.solo : CFG.roundMinutes.team) * 60,
    releaseAt: CFG.countdown + CFG.alienReleaseDelay,
    lastKill: 0,
    hintAt: 0,
    hints: {},
    podTimer: -1,
  }
  humans.forEach(p => {
    R.humans[String(p.username)] = { status: 'alive', station: -1, revives: 1, stationProgress: 0 }
  })

  for (const rule of Object.keys(ROUND_RULES)) cmd(server, `gamerule ${rule} ${ROUND_RULES[rule]}`)
  // participants: first person only, brightness capped, alien grabs instead of hitting
  humans.concat(aliens).forEach(p => cmd(server, `isolationfx rules ${p.username} on`))
  clearNoise()
  cmd(server, 'kill @e[type=isolation:thrown_gadget]')
  cmd(server, 'kill @e[type=isolation:working_joe]')
  cmd(server, 'isolationfx station reset')
  cmd(server, 'kill @e[type=item]')
  setBulkheads(server, data, sectors)
  spawnLoot(server, data, sectors, humans.length)

  const spawns = shuffle(humanSpawns)
  humans.concat(aliens).forEach(p => {
    const name = p.username
    cmd(server, `clear ${name}`)
    cmd(server, `effect clear ${name}`)
    cmd(server, `gamemode adventure ${name}`)
    p.heal(100)
  })
  humans.forEach((p, i) => {
    const m = spawns[i % spawns.length]
    cmd(server, `tp ${p.username} ${m.pos[0] + 0.5} ${m.pos[1]} ${m.pos[2] + 0.5}`)
    CFG.kit.forEach(item => cmd(server, `give ${p.username} ${item}`))
    if (CFG.flashlight) cmd(server, `item replace entity ${p.username} weapon.offhand with ${CFG.flashlight}`)
    cmd(server, `effect give ${p.username} minecraft:slowness ${CFG.countdown} 255 true`)
  })
  aliens.forEach(p => {
    const m = pick(alienSpawns)
    cmd(server, `tp ${p.username} ${m.pos[0] + 0.5} ${m.pos[1]} ${m.pos[2] + 0.5}`)
    cmd(server, `effect give ${p.username} minecraft:slowness ${R.releaseAt} 255 true`)
    cmd(server, `effect give ${p.username} minecraft:blindness ${R.releaseAt} 0 true`)
  })

  cmd(server, 'bossbar add isolation:humans ""')
  cmd(server, 'bossbar set isolation:humans color white')
  cmd(server, 'bossbar set isolation:humans max 100')
  cmd(server, 'bossbar set isolation:humans players @a[team=humans]')
  cmd(server, 'bossbar add isolation:alien ""')
  cmd(server, 'bossbar set isolation:alien color red')
  cmd(server, 'bossbar set isolation:alien max 100')
  cmd(server, 'bossbar set isolation:alien players @a[team=alien]')

  title(server, '@a[team=humans]', 'ISOLATION', `${humans.length} survivor${solo ? '' : 's'}. Something is aboard.`, 'gray')
  title(server, '@a[team=alien]', 'ISOLATION', 'You hunt. They hide.', 'dark_red')
  mapsRoundStart(server, data)
  return null
}

function endRound(server, winner, reason) {
  if (!roundActive()) return
  R.phase = 'ended'
  console.info(`Round over: ${winner || 'no winner'} (${reason})`)
  playersOf(server).forEach(p => cmd(server, `effect clear ${p.username}`))
  cmd(server, 'isolationfx vision @a off')
  cmd(server, 'isolationfx rules @a off')
  if (winner === 'humans') {
    title(server, '@a', 'SURVIVED', reason, 'white')
  } else if (winner === 'alien') {
    title(server, '@a', 'THE ALIEN WINS', reason, 'dark_red')
  } else {
    title(server, '@a', 'ROUND STOPPED', reason, 'gray')
  }
  soundAll(server, 'minecraft:block.beacon.deactivate', 1)
  later(CFG.endScreen, () => resetToLobby(server))
}

function resetToLobby(server) {
  const data = loadMarks(server)
  const lobby = marksOf(data, 'lobby')[0]
  const names = Object.keys(R.humans || {}).concat(R.aliens || [])
  names.forEach(name => {
    if (!findPlayer(server, name)) return
    cmd(server, `clear ${name}`)
    cmd(server, `effect clear ${name}`)
    cmd(server, `gamemode adventure ${name}`)
    if (lobby) cmd(server, `tp ${name} ${lobby.pos[0] + 0.5} ${lobby.pos[1]} ${lobby.pos[2] + 0.5}`)
  })
  setBulkheads(server, data, null)
  mapsRoundEnd(server)
  cmd(server, 'kill @e[type=isolation:thrown_gadget]')
  cmd(server, 'kill @e[type=isolation:working_joe]')
  cmd(server, 'isolationfx station reset')
  clearNoise()
  cmd(server, 'kill @e[type=item]')
  cmd(server, 'bossbar remove isolation:humans')
  cmd(server, 'bossbar remove isolation:alien')
  R = { phase: 'lobby' }
}

function releaseAlien(server) {
  R.aliens.forEach(name => {
    cmd(server, `effect clear ${name}`)
    applyEffects(server, name, CFG.alienEffects)
    cmd(server, `isolationfx vision ${name} on`)
    title(server, name, 'HUNT', 'Z: sonar pulse   Left Alt: scan', 'dark_red')
  })
  soundAll(server, 'isolation:alien.roar', 1)
  if (CFG.workingJoes) spawnJoes(server)
  livingHumans(server).forEach(p => soundTo(server, p.username, 'minecraft:entity.warden.ambient', p.x, p.y + 20, p.z, 1, 0.6))
}

function spectateTick(server) {
  const living = livingHumans(server)
  playersOf(server).forEach(p => {
    const name = String(p.username)
    const h = R.humans[name]
    if (!h || h.status === 'alive' || h.status === 'respawning' || !p.isSpectator()) return
    if (living.length === 0) return
    const cam = p.getCamera()
    if (cam && cam.getId() !== p.getId()) return
    cmd(server, `spectate ${pick(living).username} ${name}`)
  })
}

function alienHudTick(server) {
  const now = Date.now()
  R.aliens.forEach(name => {
    if (R.t < R.releaseAt) {
      statusLine(server, name, `Released in ${Math.ceil(R.releaseAt - R.t)}s`, 'dark_red')
      return
    }
    const hint = R.hints[name]
    if (hint && hint.until > now) return statusLine(server, name, hint.text, 'red')
    const note = ALIEN_HUD[name]
    if (note && note.until > now) return statusLine(server, name, note.text, 'red')
    statusLine(server, name, '···', 'dark_red')
  })
}

function pressureTick(server) {
  if (R.t < R.releaseAt || R.t < R.hintAt) return
  const assistAfter = R.solo ? CFG.pressureAssistAfter.solo : CFG.pressureAssistAfter.team
  if (R.t - Math.max(R.lastKill, R.releaseAt) < assistAfter) return
  R.hintAt = R.t + CFG.pressureHintEvery
  const living = livingHumans(server)
  if (living.length === 0) return
  const target = loudestHuman(server) || pick(living)
  R.aliens.forEach(name => {
    const a = findPlayer(server, name)
    if (!a) return
    R.hints[name] = { text: `you sense prey ${bearingArrow(a, target.x, target.z)}`, until: Date.now() + 3000 }
    soundTo(server, name, 'minecraft:entity.warden.heartbeat', a.x, a.y, a.z, 1, 1)
  })
}

function bossbarTick() {
  const step = currentStep(R)
  const clock = clockText(timeLeft())
  let text, value
  if (R.phase === 'countdown') {
    text = `Starting in ${Math.ceil(CFG.countdown - R.t)}`
    value = 0
  } else if (R.podTimer >= 0) {
    text = `Escape pod launching in ${Math.ceil(R.podTimer)}s · get to the pod · ${clock}`
    value = Math.round((1 - R.podTimer / CFG.podWait) * 100)
  } else if (step) {
    text = `${step.mission.text} · ${clock}`
    value = Math.round(Math.min(1, R.progress / step.mission.hold) * 100)
  } else {
    text = clock
    value = 0
  }
  return { text: text, value: value }
}

function checkEnd(server) {
  if (timeLeft() <= 0) return endRound(server, 'alien', 'Time ran out')
  const names = Object.keys(R.humans)
  const alive = names.filter(n => R.humans[n].status === 'alive' || R.humans[n].status === 'respawning')
  if (alive.length === 0) {
    endRound(server, 'alien', names.length === 1 ? 'Nobody heard you scream' : 'Nobody made it out')
  }
}

function podTick(server, dt) {
  R.podTimer -= dt
  if (R.podTimer > 0) return
  const pod = R.steps[R.steps.length - 1].mark
  const aboard = livingHumans(server).filter(p => dist(pod.pos[0] + 0.5, pod.pos[1], pod.pos[2] + 0.5, p.x, p.y, p.z) <= CFG.podRadius)
  R.podTimer = -1
  if (aboard.length === 0) {
    // nobody made it to the pod in time, it has to be launched again
    R.stepIndex = R.steps.length - 1
    R.progress = 0
    return
  }
  aboard.forEach(p => { R.humans[String(p.username)].status = 'escaped' })
  endRound(server, 'humans', `${aboard.map(p => p.username).join(', ')} escaped`)
}

function roundTick(server, dt) {
  if (!roundActive()) return
  R.t += dt

  if (R.phase === 'countdown') {
    if (R.t >= CFG.countdown) {
      R.phase = 'running'
      livingHumans(server).forEach(p => {
        applyEffects(server, p.username, CFG.humanEffects)
        const step = currentStep(R)
        if (step) title(server, p.username, '', step.mission.text, 'white')
      })
    }
  } else {
    if (R.t >= R.releaseAt && R.t - dt < R.releaseAt) releaseAlien(server)
    noiseTick(server)
    let step = currentStep(R)
    trackerTick(server, step ? step.mark.pos : null)
    if (R.podTimer >= 0) {
      podTick(server, dt)
    } else if (missionTick(server, R, dt)) {
      if (R.solo) return endRound(server, 'humans', 'You got out')
      R.podTimer = CFG.podWait
      title(server, '@a[team=humans]', '', `Escape pod launching in ${CFG.podWait}s`, 'white')
    }
    if (!roundActive()) return
    stationTick(server, R, dt)
    spectateTick(server)
    pressureTick(server)
    alienHudTick(server)
    checkEnd(server)
    if (!roundActive()) return
  }

  mapsTick(server)
  const bar = bossbarTick()
  cmd(server, `bossbar set isolation:humans name ${JSON.stringify(bar.text)}`)
  cmd(server, `bossbar set isolation:humans value ${bar.value}`)
  cmd(server, `bossbar set isolation:alien name ${JSON.stringify(`The hunt · ${clockText(timeLeft())}`)}`)
  cmd(server, `bossbar set isolation:alien value ${Math.round(Math.max(0, timeLeft() / R.length) * 100)}`)
}

let tickCounter = 0
ServerEvents.tick(event => {
  runLater()
  if (++tickCounter % 10 !== 0) return
  try {
    loadSettings()
    roundTick(event.server, 0.5)
  } catch (e) {
    console.error(`round tick failed: ${e}`)
  }
})

EntityEvents.death(event => {
  const e = event.entity
  if (!e.isPlayer() || !roundActive()) return
  const server = e.server
  const name = String(e.username)

  if (isAlien(e)) return   // shouldn't happen with resistance, respawn handles it

  const h = R.humans[name]
  if (!h || h.status !== 'alive') return
  const killer = event.source.actual
  if (killer && killer.isPlayer() && isAlien(killer)) {
    R.lastKill = R.t
    soundTo(server, killer.username, 'minecraft:entity.warden.sonic_charge', killer.x, killer.y, killer.z, 1, 1.2)
  }

  if (h.station >= 0 && h.revives > 0) {
    if (R.solo) {
      h.status = 'respawning'
      later(CFG.soloRespawnDelay, () => {
        if (roundActive() && h.status === 'respawning') revive(server, R, name)
      })
      title(server, name, 'YOU DIED', 'Emergency station restoring you...', 'dark_red')
    } else {
      h.status = 'downed'
      title(server, name, 'YOU DIED', 'A survivor can revive you at your emergency station', 'dark_red')
    }
  } else {
    h.status = 'dead'
    title(server, name, 'YOU DIED', '', 'dark_red')
  }
})

PlayerEvents.respawned(event => {
  if (!roundActive()) return
  const p = event.player
  const server = p.server
  const name = String(p.username)
  if (R.aliens.indexOf(name) >= 0) {
    const m = pick(marksOf(loadMarks(server), 'alien_spawn', R.sectors))
    if (m) cmd(server, `tp ${name} ${m.pos[0] + 0.5} ${m.pos[1]} ${m.pos[2] + 0.5}`)
    if (R.t >= R.releaseAt) applyEffects(server, name, CFG.alienEffects)
    return
  }
  const h = R.humans[name]
  if (h && h.status !== 'alive') cmd(server, `gamemode spectator ${name}`)
})

PlayerEvents.loggedOut(event => {
  if (!roundActive()) return
  const server = event.player.server
  const name = String(event.player.username)
  if (R.aliens.indexOf(name) >= 0) {
    R.aliens = R.aliens.filter(n => n !== name)
    if (R.aliens.length === 0) endRound(server, 'humans', 'The alien left the game')
    return
  }
  if (R.humans[name] && R.humans[name].status !== 'escaped') R.humans[name].status = 'dead'
})

PlayerEvents.loggedIn(event => {
  const name = String(event.player.username)
  // vision is saved on the player, so someone who left mid-round would come back blind
  if (!roundActive() || R.aliens.indexOf(name) < 0) cmd(event.player.server, `isolationfx vision ${name} off`)
  if (!roundActive() || (!R.humans[name] && R.aliens.indexOf(name) < 0)) cmd(event.player.server, `isolationfx rules ${name} off`)
  if (!roundActive()) return
  if (!R.humans[name] && R.aliens.indexOf(name) < 0) cmd(event.player.server, `gamemode spectator ${name}`)
})

ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event

  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(Commands.literal('start').executes(safely(ctx => {
        const err = startRound(ctx.source.server)
        if (err) {
          ctx.source.sendFailure(Text.of(err))
          return 0
        }
        ctx.source.sendSuccess(Text.of(`Round started: ${R.steps.length} step(s), sectors ${R.sectors.join(', ')}`), true)
        return 1
      })))
      .then(Commands.literal('stop').executes(safely(ctx => {
        if (!roundActive()) {
          ctx.source.sendFailure(Text.of('No round running'))
          return 0
        }
        endRound(ctx.source.server, null, 'Stopped by an operator')
        return 1
      })))
      .then(Commands.literal('status').executes(safely(ctx => {
        const src = ctx.source
        src.sendSystemMessage(Text.of(`Phase: ${R.phase}`))
        if (!R.humans) return 1
        src.sendSystemMessage(Text.of(`Time left: ${clockText(timeLeft())}, ${R.solo ? 'solo' : 'team'}, sectors ${R.sectors.join(', ')}`))
        R.steps.forEach((s, i) => src.sendSystemMessage(Text.of(`${i < R.stepIndex ? '[x]' : i === R.stepIndex ? '[>]' : '[ ]'} ${s.mission.text} @ ${s.mark.pos.join(' ')}`)))
        Object.keys(R.humans).forEach(n => {
          const h = R.humans[n]
          src.sendSystemMessage(Text.of(`${n}: ${h.status}${h.station >= 0 ? ', station #' + h.station : ''}`))
        })
        src.sendSystemMessage(Text.of(`Alien: ${R.aliens.join(', ')}`))
        return 1
      })))
  )
})
