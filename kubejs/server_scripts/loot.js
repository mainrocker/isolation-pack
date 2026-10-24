// priority: 50
// Scrap spawns at "loot" marks at round start. More humans, more of the marks get something.
// The flamethrower and each blueprint turn up at most once per round.

const LOOT_TABLE = [
  ['isolation:scrap_metal', 3],
  ['isolation:adhesive', 2],
  ['isolation:chemicals', 2.5],
  ['isolation:wiring', 2],
  ['isolation:battery', 1],
  ['isolation:medkit', 0.4],
  ['isolation:flare', 0.4],
  ['isolation:fuel_canister', 0.5],
  ['isolation:blueprint_smoke_bomb', 0.3],
  ['isolation:blueprint_molotov', 0.25],
  ['isolation:flamethrower', 0.15],
]

const LOOT_ONCE = ['isolation:flamethrower', 'isolation:blueprint_smoke_bomb', 'isolation:blueprint_molotov']

function rollLoot(exclude) {
  const table = LOOT_TABLE.filter(e => exclude.indexOf(e[0]) < 0)
  let total = 0
  table.forEach(e => { total += e[1] })
  let r = Math.random() * total
  for (const e of table) {
    r -= e[1]
    if (r <= 0) return e[0]
  }
  return table[0][0]
}

function spawnLoot(server, data, sectors, humanCount) {
  const chance = Math.min(1, CFG.loot.baseChance + CFG.loot.perHuman * humanCount)
  const used = []
  let spawned = 0
  shuffle(marksOf(data, 'loot', sectors)).forEach(m => {
    if (Math.random() > chance) return
    const id = rollLoot(used)
    if (LOOT_ONCE.indexOf(id) >= 0) used.push(id)
    cmd(server, `summon item ${m.pos[0] + 0.5} ${m.pos[1] + 0.2} ${m.pos[2] + 0.5} {Item:{id:"${id}",count:1},PickupDelay:0,Age:-32768,Motion:[0.0,0.0,0.0]}`)
    spawned++
  })
  return spawned
}
