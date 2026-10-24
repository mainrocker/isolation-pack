// priority: 5
// /isolation dev fearless  readies the FEARLESS station (map by Vitruv_) for our rounds. REPLACES all marks.
//
// Everything is placed where the map already had something: mission terminals become objectives,
// its loot spots, respawn points and escape pods stay what they were. Its own game (lobby, perks, missions) is switched off by the
// fearless_strip function; the sliding doors, the lift and the room names keep working.
//
// The rest comes from fearless_survey.js (made by scripts/fearless_survey.py): rewire terminals
// with alarm speakers and smoke vents, maintenance panels, crawl ducts for humans, and the
// bulkheads that shut B and A deck in small games. The map's lamps become our station lights
// (same look), so the terminals can cut them.

const FEARLESS = {
  lobby: [40, 51, 11],
  humanSpawns: [[14, 51, 1], [15, 51, -9], [9, 51, -27]],
  alienSpawn: [58, 52, -33],          // the specimen holding bay
  joeSpawns: [[-17, 62, -38], [-11, 51, -109], [36, 62, -62]],

  // [mission id, x, y, z], one line per terminal; several terminals can share a mission
  objectives: [
    ['reactor', 12, 51, -83], ['medical', 53, 51, -53], ['comms', 28, 62, -30], ['comms', 23, 62, -5],
    ['tram', 36, 51, -107], ['tram', -6, 69, -29], ['security', -14, 60, -28],
    ['airlock', 41, 62, -87], ['airlock', 15, 52, -128], ['airlock', 8, 51, -24],
    ['blackbox', -21, 60, -11], ['records', -20, 51, -108], ['records', -11, 51, -93], ['cellblock', -39, 51, -90],
    ['habitat', -18, 63, -110], ['habitat', -37, 65, -63], ['cargo', 37, 64, -51], ['codes', -15, 51, -29],
    ['canteen', -18, 63, -44], ['control', 26, 52, -25], ['control', 19, 51, -37], ['storage', -44, 51, -48],
    ['storage', -27, 51, -25], ['crew', 10, 63, -39], ['crew', -3, 60, -35],
  ],
  pods: [[-48, 51, -65], [32, 51, -127], [-45, 70, -35], [41, 62, -118]],
  stations: [[-44, 68, -27], [-39, 62, -123], [-29, 51, -55], [-25, 50, -8], [-10, 51, 0], [0, 51, -8], [15, 62, 3],
    [20, 51, -132], [27, 51, -79], [28, 64, -33], [28, 64, -15], [35, 62, -102], [41, 51, -105]],
  loot: [[-45, 51, -56], [-44, 50, -31], [-44, 68, -27], [-41, 51, -56], [-41, 65, -63], [-32, 51, -30], [-31, 51, -44],
    [-31, 60, -30], [-26, 51, -40], [-23, 51, -110], [-21, 63, -121], [-17, 63, -121], [-12, 62, -53], [-9, 51, -32],
    [-7, 51, -32], [0, 51, -23], [2, 51, -23], [4, 51, -82], [5, 51, -29], [6, 63, -4], [8, 51, -40], [10, 63, 4],
    [11, 63, -49], [13, 51, -55], [18, 62, -49], [22, 51, -50], [26, 51, -82], [28, 64, -33], [30, 51, -58],
    [30, 64, -54], [30, 64, -16], [35, 64, -45], [35, 64, -3], [40, 64, -57], [47, 64, -52], [54, 51, -57], [54, 51, -48]],


  // sliding doors swapped for our station doors: [map door, lock, doorway from, doorway to].
  // None of them is the only way to an objective, pod or station (checked by walking the map),
  // so a locked one never strands a round.
  stationDoors: [
    ['Small_1', 'keypad', [-8, 51, -24], [-8, 53, -22]],     // the wing behind the main office, three loot spots
    ['Small_9', 'keypad', [12, 51, -39], [12, 53, -37]],     // side room off the control room corridor
    ['Small_23', 'sealed', [0, 63, -45], [0, 65, -43]],      // B deck block behind the crew offices, reachable by vent
    ['Small_12', 'jammed', [-11, 51, -35], [-9, 53, -35]],   // loud shortcuts, there's always a way around
    ['Small_5', 'jammed', [-18, 51, -44], [-18, 53, -42]],
  ],
  // behind the sealed door, so the torch is worth the glare
  sealedLoot: [[-14, 63, -47], [-5, 63, -46]],
}

// how tall the block's collision box is, 0 for air and 1 for a full block.
// The map builds floors from grates and trapdoors, so "solid or not" isn't enough
const $BlockPos = Java.loadClass('net.minecraft.core.BlockPos')

function fearlessState(level, x, y, z) {
  return level.getBlockState(new $BlockPos(x, y, z))
}

function fearlessHeight(level, x, y, z) {
  let shape = fearlessState(level, x, y, z).getCollisionShape(level, new $BlockPos(x, y, z))
  return shape.isEmpty() ? 0 : shape.bounds().maxY
}

function fearlessSolid(level, x, y, z) {
  return fearlessHeight(level, x, y, z) >= 1
}

// feet at y: either a thin floor piece in this block, or a proper floor right under it
function fearlessStandable(level, x, y, z) {
  let here = fearlessHeight(level, x, y, z)
  if (here > 0.25 || fearlessHeight(level, x, y + 1, z) > 0) return false
  return here > 0 || fearlessHeight(level, x, y - 1, z) >= 0.5
}

// the map's markers sit in floors and walls; find the nearest spot a player can stand on
function fearlessFloor(level, p) {
  let dys = [0, 1, -1, 2, -2, 3, -3]
  for (let r = 0; r <= 2; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        for (let dy of dys) {
          if (fearlessStandable(level, p[0] + dx, p[1] + dy, p[2] + dz)) return [p[0] + dx, p[1] + dy, p[2] + dz]
        }
      }
    }
  }
  return p
}

// air or a thin floor piece, and nothing with an inventory or a command in it
function fearlessFree(level, x, y, z) {
  if (level.getBlockEntity(new $BlockPos(x, y, z))) return false
  let st = fearlessState(level, x, y, z)
  if (st.isAir() || st.canBeReplaced() && !st.liquid()) return true
  let h = fearlessHeight(level, x, y, z)
  return h > 0 && h <= 0.25
}



// the map lights its rooms with sea lanterns (the ceiling panels), glowstone and soul lanterns
// (hidden ones that look like concrete); swap them all for station lights of the same look
function fearlessLights(server) {
  let styles = [['minecraft:sea_lantern', 'panel'], ['minecraft:glowstone', 'glow'], ['minecraft:soul_lantern', 'soul']]
  for (let x = -64; x <= 95; x += 32) {
    for (let z = -144; z <= 63; z += 20) {
      for (let s of styles) {
        cmd(server, `fill ${x} 40 ${z} ${Math.min(x + 31, 95)} 90 ${Math.min(z + 19, 63)} isolation:station_light[style=${s[1]}] replace ${s[0]}`)
      }
    }
  }
  FEARLESS_SURVEY.flicker.forEach(p => {
    cmd(server, `execute if block ${p[0]} ${p[1]} ${p[2]} isolation:station_light run setblock ${p[0]} ${p[1]} ${p[2]} isolation:station_light[style=panel,flickers=true]`)
  })
}

// everything the survey picked: ducts, rewire terminals with their devices, panels
function fearlessFurnish(server) {
  let c = s => cmd(server, s)
  FEARLESS_SURVEY.ducts.forEach(d => {
    d.carve.forEach(p => c(`setblock ${p[0]} ${p[1]} ${p[2]} air`))
    d.grates.forEach((p, i) => c(`setblock ${p[0]} ${p[1]} ${p[2]} isolation:vent_grate[facing=${d.facing[i]}]`))
    console.info(`fearless: crawl duct ${d.grates[0]} -> ${d.grates[1]}, saves about ${d.saves} steps`)
  })
  FEARLESS_SURVEY.rewire.forEach(r => {
    c(`setblock ${r.pos[0]} ${r.pos[1]} ${r.pos[2]} isolation:rewire_station[facing=${r.facing}]`)
    if (r.smoke) c(`setblock ${r.smoke[0]} ${r.smoke[1]} ${r.smoke[2]} isolation:smoke_vent`)
    r.alarms.forEach(a => c(`setblock ${a[0]} ${a[1]} ${a[2]} isolation:alarm_speaker`))
    console.info(`fearless: rewire terminal in the ${r.room} at ${r.pos}`)
  })
  FEARLESS_SURVEY.panels.forEach(p => c(`setblock ${p.pos[0]} ${p.pos[1]} ${p.pos[2]} isolation:maintenance_panel[facing=${p.facing}]`))
}

// walls up one of the map's 3-wide sliding doorways and puts a station door in the middle of it.
// The map's door model and its frame (which runs the sliding) are removed with it
function fearlessStationDoor(server, level, d) {
  let from = d[2]
  let to = d[3]
  cmd(server, `kill @e[type=minecraft:armor_stand,name=Door_${d[0]}]`)
  cmd(server, `kill @e[type=minecraft:armor_stand,name=Frame_${d[0]}]`)
  let alongZ = from[0] === to[0]
  let mid = alongZ ? Math.floor((from[2] + to[2]) / 2) : Math.floor((from[0] + to[0]) / 2)
  // match the wall next to the doorway
  let wall = alongZ ? fearlessState(level, from[0], from[1] + 1, to[2] + 1) : fearlessState(level, to[0] + 1, from[1] + 1, from[2])
  // or the lintel above it, if the side is something odd
  if (wall.isAir() || !wall.isCollisionShapeFullBlock(level, new $BlockPos(from[0], from[1], from[2]))) {
    wall = alongZ ? fearlessState(level, from[0], to[1] + 1, mid) : fearlessState(level, mid, to[1] + 1, from[2])
  }
  for (let x = from[0]; x <= to[0]; x++) {
    for (let y = from[1]; y <= to[1]; y++) {
      for (let z = from[2]; z <= to[2]; z++) {
        let gap = (alongZ ? z : x) === mid && y < from[1] + 2
        if (!gap) level.setBlock(new $BlockPos(x, y, z), wall, 3)
      }
    }
  }
  let x = alongZ ? from[0] : mid
  let z = alongZ ? mid : from[2]
  let facing = alongZ ? 'east' : 'south'
  cmd(server, `setblock ${x} ${from[1]} ${z} air`)
  cmd(server, `setblock ${x} ${from[1] + 1} ${z} air`)
  cmd(server, `setblock ${x} ${from[1]} ${z} isolation:station_door[facing=${facing},half=lower,lock=${d[1]}]`)
  cmd(server, `setblock ${x} ${from[1] + 1} ${z} isolation:station_door[facing=${facing},half=upper,lock=${d[1]}]`)
  console.info(`fearless: ${d[1]} door at ${x} ${from[1]} ${z} (was ${d[0]})`)
}

function setupFearless(server) {
  let c = s => cmd(server, s)
  let level = server.overworld()
  c('forceload add -64 -144 96 64')
  c('function isolation:fearless_strip')
  // the door and lift machine has to run even when nobody is standing next to it
  c('forceload add -48 -72 0 -16')
  FEARLESS.stationDoors.forEach(d => fearlessStationDoor(server, level, d))
  fearlessLights(server)
  fearlessFurnish(server)

  let points = []
  let mark = (type, p, id) => {
    let m = { type: type, sector: FEARLESS_SURVEY.sectors[p.join(',')] || 'c_deck', pos: fearlessFloor(level, p) }
    if (id) m.id = id
    points.push(m)
    return m
  }
  points.push({ type: 'lobby', sector: 'c_deck', pos: FEARLESS.lobby })
  FEARLESS.humanSpawns.forEach(p => mark('human_spawn', p))
  mark('alien_spawn', FEARLESS.alienSpawn)
  FEARLESS.joeSpawns.forEach(p => mark('joe_spawn', p))
  FEARLESS.objectives.forEach(o => mark('objective', [o[1], o[2], o[3]], o[0]))
  FEARLESS.pods.forEach(p => mark('pod', p))
  FEARLESS.loot.forEach(p => mark('loot', p))
  FEARLESS.sealedLoot.forEach(p => mark('loot', p))
  FEARLESS.stations.forEach(p => {
    let m = mark('station', p)
    c(`setblock ${m.pos[0]} ${m.pos[1]} ${m.pos[2]} minecraft:respawn_anchor`)
  })

  // where each deck's layout downloads from (see maps.js)
  FEARLESS_SURVEY.mapStations.forEach(s => {
    c(`setblock ${s.pos[0]} ${s.pos[1]} ${s.pos[2]} isolation:map_station[facing=${s.facing}]`)
    points.push({ type: 'map_station', sector: s.sector, pos: s.pos })
  })


  c('forceload remove -64 -144 96 64')
  c('forceload add -48 -72 0 -16')
  c(`setworldspawn ${FEARLESS.lobby[0]} ${FEARLESS.lobby[1]} ${FEARLESS.lobby[2]}`)
  // with few humans only C deck is in play; B deck joins at three, A deck at five
  saveMarks(server, {
    mapId: 'fearless',
    points: points,
    bulkheads: FEARLESS_SURVEY.bulkheads,
    sectorsByHumans: { 1: ['c_deck'], 2: ['c_deck'], 3: ['c_deck', 'b_deck'], 4: ['c_deck', 'b_deck'] },
  })
  return {
    marks: points.length, doors: FEARLESS.stationDoors.length,
    terminals: FEARLESS_SURVEY.rewire.length, panels: FEARLESS_SURVEY.panels.length, ducts: FEARLESS_SURVEY.ducts.length,
  }
}

ServerEvents.commandRegistry(event => {
  let { commands: Commands } = event
  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(Commands.literal('dev')
        .then(Commands.literal('fearless').executes(safely(ctx => {
          if (roundActive()) {
            ctx.source.sendFailure(Text.of('Stop the round first'))
            return 0
          }
          let n = setupFearless(ctx.source.server)
          ctx.source.sendSuccess(Text.of(`FEARLESS ready: ${n.marks} marks, ${n.doors} station doors, ${n.terminals} rewire terminals, ${n.panels} panels, ${n.ducts} crawl ducts`), true)
          return 1
        }))))
  )
})
