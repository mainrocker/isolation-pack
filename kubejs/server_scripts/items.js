// priority: 60
// Motion tracker. The rest of the survival kit (gadgets, medkit, flamethrower, crafting)
// lives in the mod now.

function holding(p, id) {
  return String(p.mainHandItem.id) === id || String(p.offHandItem.id) === id
}

// tracker: distance and direction to moving aliens, no height. Silent until it pings.
function trackerTick(server, objectivePos) {
  const aliens = playersOf(server).filter(a => isAlien(a) && !a.isSpectator())
  playersOf(server).forEach(p => {
    if (!isHuman(p) || p.isSpectator() || !holding(p, 'kubejs:motion_tracker')) return
    let nearest = null
    aliens.forEach(a => {
      if (!movedRecently(String(a.username), 1)) return
      const d = distXZ(a.x, a.z, p.x, p.z)
      if (d <= CFG.tracker.range && (!nearest || d < nearest.d)) nearest = { a: a, d: d }
    })
    if (nearest) {
      hud(server, p.username, 'tracker', `TRACKER  ${bearingArrow(p, nearest.a.x, nearest.a.z)}  ${Math.round(nearest.d)}m`, 'green')
      if (!throttled(`tracker:${p.username}`, 1)) {
        let pitch = 0.8 + (1 - nearest.d / CFG.tracker.range) * 1.2
        soundTo(server, p.username, 'isolation:tracker.ping', p.x, p.y, p.z, 0.7, pitch)
        makeNoise(server, p.x, p.y, p.z, CFG.noise.tracker, String(p.username))
      }
    } else if (objectivePos) {
      let d = distXZ(objectivePos[0] + 0.5, objectivePos[2] + 0.5, p.x, p.z)
      hud(server, p.username, 'tracker', `TRACKER  ···   objective ${bearingArrow(p, objectivePos[0] + 0.5, objectivePos[2] + 0.5)} ${Math.round(d)}m`, 'dark_green')
    } else {
      hud(server, p.username, 'tracker', 'TRACKER  ···', 'dark_green')
    }
  })
}
