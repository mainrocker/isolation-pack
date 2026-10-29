// priority: 70
// Noises reach the alien two ways. Every one shows in its LiDAR view wherever it is, seen through
// every wall, as waves as many and as wide as the noise was loud. The ones it actually hears also
// give a bearing on the action bar: how far a noise carries depends on how loud it is, the loudest
// (CFG.noiseHeardEverywhere and up) reaching the whole station, the rest CFG.noiseHearing times
// their radius.

const MOTION = {}      // name -> { x, z, movedAt }
const ALIEN_HUD = {}   // alien name -> { text, until, weight }
const NOISE_SCORE = {} // human name -> { radius, at }, used by pressure assist
const NOISE_THROTTLE = {}

function makeNoise(server, x, y, z, radius, sourceName) {
  if (!radius || radius <= 0) return
  const now = Date.now()
  if (sourceName) {
    let prev = NOISE_SCORE[sourceName]
    if (!prev || prev.at < now - 5000 || prev.radius <= radius) NOISE_SCORE[sourceName] = { radius: radius, at: now }
  }
  playersOf(server).forEach(alien => {
    if (!isAlien(alien) || alien.isSpectator()) return
    const d = dist(alien.x, alien.y, alien.z, x, y, z)
    const loud = radius >= CFG.noiseHeardEverywhere
    const reach = radius * CFG.noiseHearing
    // seen whatever the distance, as loud as it was
    cmd(server, `isolationfx ping ${alien.username} ${x} ${y} ${z} noise ${radius.toFixed(1)}`)
    if (!loud && d > reach) return
    const hud = ALIEN_HUD[alien.username]
    // louder relative to distance wins the action bar slot
    const weight = radius / Math.max(d, 1)
    if (!hud || hud.until < now || hud.weight <= weight) {
      ALIEN_HUD[alien.username] = {
        text: `noise ${bearingArrow(alien, x, z)} ${Math.round(d)}m`,
        until: now + CFG.noiseShowSeconds * 1000,
        weight: weight,
      }
    }
  })
}

function throttled(key, seconds) {
  const now = Date.now()
  if (NOISE_THROTTLE[key] && NOISE_THROTTLE[key] > now) return true
  NOISE_THROTTLE[key] = now + seconds * 1000
  return false
}

function movedRecently(name, seconds) {
  const m = MOTION[name]
  return !!m && m.movedAt > Date.now() - seconds * 1000
}

// called every half second while a round runs
function noiseTick(server) {
  const now = Date.now()
  playersOf(server).forEach(p => {
    if (p.isSpectator()) return
    const name = String(p.username)
    const prev = MOTION[name]
    const moved = !!prev && distXZ(prev.x, prev.z, p.x, p.z) > 0.15
    MOTION[name] = { x: p.x, z: p.z, movedAt: moved ? now : (prev ? prev.movedAt : 0) }

    if (!isHuman(p) || !moved || p.isCrouching()) return
    if (p.isSprinting()) {
      makeNoise(server, p.x, p.y, p.z, CFG.noise.sprint, name)
    } else if (!throttled(`walk:${name}`, 1)) {
      makeNoise(server, p.x, p.y, p.z, CFG.noise.walk, name)
    }
  })
}

function loudestHuman(server) {
  const now = Date.now()
  let best = null
  playersOf(server).forEach(p => {
    if (!isHuman(p) || p.isSpectator()) return
    const s = NOISE_SCORE[String(p.username)]
    const score = s && s.at > now - 30000 ? s.radius : 0
    if (!best || score > best.score) best = { player: p, score: score }
  })
  return best ? best.player : null
}

function clearNoise() {
  for (const k of Object.keys(MOTION)) delete MOTION[k]
  for (const k of Object.keys(ALIEN_HUD)) delete ALIEN_HUD[k]
  for (const k of Object.keys(NOISE_SCORE)) delete NOISE_SCORE[k]
}

// the mod reports its own sounds here: tools, gadgets, a grabbed human screaming
ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event
  const arg = (name, type) => Commands.argument(name, type.create(event))

  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(Commands.literal('noise')
        .then(arg('x', Arguments.DOUBLE).then(arg('y', Arguments.DOUBLE).then(arg('z', Arguments.DOUBLE)
          .then(arg('radius', Arguments.FLOAT).then(arg('source', Arguments.WORD).executes(safely(ctx => {
            // '-' means nobody in particular, like a thrown noisemaker
            const source = String(Arguments.WORD.getResult(ctx, 'source'))
            makeNoise(ctx.source.server,
              Arguments.DOUBLE.getResult(ctx, 'x'), Arguments.DOUBLE.getResult(ctx, 'y'), Arguments.DOUBLE.getResult(ctx, 'z'),
              Arguments.FLOAT.getResult(ctx, 'radius'), source === '-' ? null : source)
            return 1
          })))))))))
})

BlockEvents.rightClicked(event => {
  if (!roundRunning()) return
  const id = String(event.block.id)
  if (!/_door$|_trapdoor$|_fence_gate$/.test(id)) return
  const p = event.player
  if (!isHuman(p) || throttled(`door:${p.username}`, 0.5)) return
  makeNoise(p.server, event.block.x + 0.5, event.block.y, event.block.z + 0.5, CFG.noise.door, String(p.username))
})
