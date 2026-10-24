// priority: 50
// Station maps. The pictures are client assets made by scripts/fearless_maps.py; this decides what
// each player's map holds. Humans carry no map: using a wall terminal opens it there, and teaches
// the whole team that terminal's deck for the round, so later terminals show every deck they've
// been to. The alien knows the station, ducts and all, and opens its map with M any time.
// A map needs mapId in its marks (the FEARLESS setup sets it) and map_station marks with sectors.
// Each player's map follows their team, so someone switched to the alien mid-round gets the
// whole station, and a switch back gives them what the humans have downloaded.

const DECK_NAMES = { c_deck: 'C deck', b_deck: 'B deck', a_deck: 'A deck' }
// how far the "map station this way" hint reaches
const MAP_HINT_RANGE = 60

function mapsRoundStart(server, data) {
  R.mapDecks = []
  R.mapMode = {}
  R.mapId = data.mapId || null
  if (!R.mapId) return
  R.mapMarks = {}
  ;['station', 'pod', 'map_station'].forEach(kind => { R.mapMarks[kind] = marksOf(data, kind, R.sectors) })
  mapsTick(server)
}

function mapsSend(server, name, mode) {
  R.mapMode[name] = mode
  if (mode === 'alien') {
    cmd(server, `isolationfx map ${name} load ${R.mapId} true`)
    return
  }
  cmd(server, `isolationfx map ${name} load ${R.mapId} false`)
  Object.keys(R.mapMarks).forEach(kind => {
    R.mapMarks[kind].forEach(m => cmd(server, `isolationfx map ${name} mark ${kind} ${m.pos[0]} ${m.pos[1]} ${m.pos[2]}`))
  })
  R.mapDecks.forEach(deck => cmd(server, `isolationfx map ${name} unlock ${deck}`))
  let step = currentStep(R)
  if (step) cmd(server, `isolationfx map ${name} mark objective ${step.mark.pos[0]} ${step.mark.pos[1]} ${step.mark.pos[2]}`)
}

function mapModeOf(player) {
  return isAlien(player) ? 'alien' : isHuman(player) ? 'human' : null
}

// every round loop: keep maps in step with teams, and point humans at the nearest map station
// whose deck they don't have yet
function mapsTick(server) {
  if (!roundActive() || !R.mapId) return
  playersOf(server).forEach(p => {
    let name = String(p.username)
    let mode = mapModeOf(p)
    if (!mode) return
    if (R.mapMode[name] !== mode) mapsSend(server, name, mode)
    if (mode !== 'human' || p.isSpectator()) return
    let nearest = null
    R.mapMarks.map_station.forEach(m => {
      if (R.mapDecks.indexOf(m.sector) >= 0) return
      let d = dist(m.pos[0] + 0.5, m.pos[1], m.pos[2] + 0.5, p.x, p.y, p.z)
      if (d <= MAP_HINT_RANGE && (!nearest || d < nearest.d)) nearest = { m: m, d: d }
    })
    if (nearest) {
      let deck = DECK_NAMES[nearest.m.sector] || nearest.m.sector
      hud(server, name, 'map', `MAP TERMINAL  ${bearingArrow(p, nearest.m.pos[0] + 0.5, nearest.m.pos[2] + 0.5)}  ${Math.round(nearest.d)}m  (${deck})`, 'dark_aqua')
    }
  })
}

// the current mission step, on every human's map
function mapsObjective(server) {
  if (!roundActive() || !R.mapId) return
  let step = currentStep(R)
  playersOf(server).forEach(p => {
    if (R.mapMode[String(p.username)] !== 'human') return
    cmd(server, `isolationfx map ${p.username} unmark objective`)
    if (step) cmd(server, `isolationfx map ${p.username} mark objective ${step.mark.pos[0]} ${step.mark.pos[1]} ${step.mark.pos[2]}`)
  })
}

function mapsRoundEnd(server) {
  cmd(server, 'isolationfx map @a clear')
}

BlockEvents.rightClicked('isolation:map_station', event => {
  if (String(event.hand) !== 'MAIN_HAND' || !roundActive() || !R.mapId) return
  let player = event.player
  if (!isHuman(player)) return
  let server = event.server
  let b = event.block
  let mark = R.mapMarks.map_station.find(m => m.pos[0] === b.x && m.pos[1] === b.y && m.pos[2] === b.z)
  if (!mark) return
  let deck = DECK_NAMES[mark.sector] || mark.sector
  if (R.mapDecks.indexOf(mark.sector) < 0) {
    R.mapDecks.push(mark.sector)
    playersOf(server).forEach(p => {
      if (R.mapMode[String(p.username)] !== 'human') return
      cmd(server, `isolationfx map ${p.username} unlock ${mark.sector}`)
      if (String(p.username) !== String(player.username)) cmd(server, `isolationfx hud ${p.username} notice 80 aqua ${deck} layout added to the terminals`)
    })
  }
  cmd(server, `isolationfx map ${player.username} open`)
})
