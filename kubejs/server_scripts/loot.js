// priority: 50
// Loot turns up at round start, at "loot" marks (lying on the floor) and at loot spot blocks
// (picked up with a right click, see the mod's LootSpots). More humans, more of them get something.
// What it is goes by the loot weights in the settings' Loot tab; the flamethrower and each
// blueprint turn up at most once per round.

const LOOT_ITEMS = ['scrap_metal', 'adhesive', 'chemicals', 'wiring', 'battery', 'medkit', 'flare', 'fuel_canister',
  'blueprint_smoke_bomb', 'blueprint_molotov', 'flamethrower', 'noisemaker', 'smoke_bomb', 'molotov']

const LOOT_ONCE = ['isolation:flamethrower', 'isolation:blueprint_smoke_bomb', 'isolation:blueprint_molotov']

function rollLoot(exclude) {
  const table = LOOT_ITEMS.map(id => ['isolation:' + id, setting('loot.w.' + id)])
    .filter(e => e[1] > 0 && exclude.indexOf(e[0]) < 0)
  if (table.length === 0) return null
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
    if (!id) return
    if (LOOT_ONCE.indexOf(id) >= 0) used.push(id)
    cmd(server, `summon item ${m.pos[0] + 0.5} ${m.pos[1] + 0.2} ${m.pos[2] + 0.5} {Item:{id:"${id}",count:1},PickupDelay:0,Age:-32768,Motion:[0.0,0.0,0.0]}`)
    spawned++
  })
  cmd(server, `isolationfx loot stock ${chance}`)
  return spawned
}
