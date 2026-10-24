// priority: 50
// Emergency stations, the save phones. Crouch at one for a few seconds to register.
// Solo: you come back there once after dying. Team: a living teammate revives you there.

function stationTick(server, R, dt) {
  const stations = R.stations
  livingHumans(server).forEach(p => {
    const name = String(p.username)
    const h = R.humans[name]
    if (!h || !p.isCrouching()) {
      if (h) h.stationProgress = 0
      return
    }
    let here = -1
    stations.forEach((m, i) => { if (nearMark(p, m)) here = i })
    if (here < 0) {
      h.stationProgress = 0
      return
    }

    // someone downed at this station? reviving takes priority
    const downed = Object.keys(R.humans).filter(n => R.humans[n].status === 'downed' && R.humans[n].station === here)
    if (downed.length > 0) {
      h.stationProgress += dt
      statusLine(server, name, `Reviving ${downed[0]}... ${Math.min(100, Math.round(h.stationProgress / CFG.reviveTime * 100))}%`, 'yellow')
      if (h.stationProgress >= CFG.reviveTime) {
        h.stationProgress = 0
        revive(server, R, downed[0])
      }
      return
    }

    if (h.station === here) return
    h.stationProgress += dt
    statusLine(server, name, `Registering... ${Math.min(100, Math.round(h.stationProgress / CFG.stationRegisterTime * 100))}%`, 'yellow')
    if (h.stationProgress >= CFG.stationRegisterTime) {
      h.stationProgress = 0
      h.station = here
      let m = stations[here]
      soundAt(server, 'minecraft:block.note_block.chime', m.pos[0] + 0.5, m.pos[1], m.pos[2] + 0.5, 1, 1.4)
      makeNoise(server, m.pos[0] + 0.5, m.pos[1], m.pos[2] + 0.5, CFG.noise.station, name)
      tell(server, name, 'Emergency station: registered', 'yellow')
    }
  })
}

function revive(server, R, name) {
  const h = R.humans[name]
  const p = findPlayer(server, name)
  if (!h || !p) return
  if (!p.isAlive()) {
    // still on the death screen, try again shortly
    later(1, () => { if (roundActive() && h.status !== 'alive') revive(server, R, name) })
    return
  }
  const m = R.stations[h.station]
  h.status = 'alive'
  h.revives--
  cmd(server, `gamemode adventure ${name}`)
  cmd(server, `tp ${name} ${m.pos[0] + 0.5} ${m.pos[1]} ${m.pos[2] + 0.5}`)
  applyEffects(server, name, CFG.humanEffects)
  title(server, name, 'Back on your feet', 'Stay quiet', 'yellow')
  soundAt(server, 'minecraft:block.note_block.chime', m.pos[0] + 0.5, m.pos[1], m.pos[2] + 0.5, 1, 0.8)
}
