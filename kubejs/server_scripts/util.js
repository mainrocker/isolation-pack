// priority: 95

function cmd(server, command) {
  server.runCommandSilent(command)
}

// a line above the hotbar, drawn by the mod (ClientHud). Not the action bar: map room names
// overwrite that every tick. The round loop refreshes lines every 10 ticks; they fade after 25
function hud(server, name, slot, text, color) {
  cmd(server, `isolationfx hud ${name} ${slot} 25 ${color || 'white'} ${text}`)
}

function statusLine(server, name, text, color) {
  hud(server, name, 'status', text, color)
}

function title(server, target, text, sub, color) {
  cmd(server, `title ${target} times 5 50 15`)
  if (sub) cmd(server, `title ${target} subtitle ${JSON.stringify({ text: sub, color: 'gray' })}`)
  cmd(server, `title ${target} title ${JSON.stringify({ text: text, color: color || 'white' })}`)
}

function tell(server, target, text, color) {
  cmd(server, `tellraw ${target} ${JSON.stringify({ text: text, color: color || 'gray' })}`)
}

function soundTo(server, name, sound, x, y, z, volume, pitch) {
  cmd(server, `playsound ${sound} master ${name} ${x} ${y} ${z} ${volume || 1} ${pitch || 1}`)
}

function soundAt(server, sound, x, y, z, volume, pitch) {
  cmd(server, `playsound ${sound} block @a ${x} ${y} ${z} ${volume || 1} ${pitch || 1}`)
}

// wraps a command body so script errors get logged instead of "an unexpected error occurred"
function safely(fn) {
  return ctx => {
    try {
      return fn(ctx)
    } catch (e) {
      console.error(`command failed: ${e}`)
      if (e.stack) console.error(e.stack)
      ctx.source.sendFailure(Text.of(`Script error: ${e}`))
      return 0
    }
  }
}

// same sound for everyone, played right at each listener
function soundAll(server, sound, pitch) {
  cmd(server, `execute as @a at @s run playsound ${sound} master @s ~ ~ ~ 1 ${pitch || 1}`)
}

function dist(ax, ay, az, bx, by, bz) {
  const dx = ax - bx, dy = ay - by, dz = az - bz
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function distXZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

// arrow pointing from the player's view toward (x, z)
function bearingArrow(player, x, z) {
  const yaw = Math.atan2(-(x - player.x), z - player.z) * 180 / Math.PI
  let rel = (yaw - player.getViewYRot(1)) % 360
  if (rel < -180) rel += 360
  if (rel > 180) rel -= 360
  const i = ((Math.round(rel / 45) % 8) + 8) % 8
  return ARROWS[i]
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function shuffle(list) {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1))
    let t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

// simple scheduler driven from round.js tick, cleared on script reload
const LATER = []

function later(seconds, fn) {
  LATER.push({ at: Date.now() + seconds * 1000, fn: fn })
}

function runLater() {
  const now = Date.now()
  for (let i = LATER.length - 1; i >= 0; i--) {
    if (LATER[i].at <= now) {
      let job = LATER.splice(i, 1)[0]
      try {
        job.fn()
      } catch (e) {
        console.error(`scheduled job failed: ${e}`)
      }
    }
  }
}
