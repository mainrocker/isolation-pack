// priority: 90
// Roles are plain scoreboard teams. The isolation mod reads them,
// these scripts (or ops with /team) set them.
// Keep the names in sync with serverconfig/isolation-server.toml

const ALIEN_TEAM = 'alien'
const HUMAN_TEAM = 'humans'

ServerEvents.loaded(event => {
  const server = event.server

  server.runCommandSilent(`team add ${ALIEN_TEAM}`)
  server.runCommandSilent(`team add ${HUMAN_TEAM}`)

  for (const team of [ALIEN_TEAM, HUMAN_TEAM]) {
    server.runCommandSilent(`team modify ${team} nametagVisibility never`)
    server.runCommandSilent(`team modify ${team} friendlyFire false`)
    server.runCommandSilent(`team modify ${team} deathMessageVisibility never`)
  }
  server.runCommandSilent(`team modify ${ALIEN_TEAM} color dark_red`)
  server.runCommandSilent(`team modify ${HUMAN_TEAM} color gray`)
})

function setRole(player, team) {
  if (team) {
    player.server.runCommandSilent(`team join ${team} ${player.username}`)
  } else {
    player.server.runCommandSilent(`team leave ${player.username}`)
  }
}

function roleOf(player) {
  const team = player.team
  return team ? String(team.name) : null
}

function isAlien(player) {
  return roleOf(player) === ALIEN_TEAM
}

function isHuman(player) {
  return roleOf(player) === HUMAN_TEAM
}

// java list -> plain js array, so filter/map/sort work
function playersOf(server) {
  const list = []
  server.players.forEach(p => list.push(p))
  return list
}

function findPlayer(server, name) {
  const list = playersOf(server)
  for (const p of list) {
    if (String(p.username) === name) return p
  }
  return null
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event

  const roleCmd = (name, team) => Commands.literal(name)
    .executes(ctx => {
      let players
      try {
        players = Arguments.PLAYERS.getResult(ctx, 'targets')
      } catch (e) {
        // usually "No player was found"; rhino wraps it, so vanilla shows a generic error
        ctx.source.sendFailure(Text.of(`${e.message || e}`.replace(/^.*Exception: /, '')))
        return 0
      }
      players.forEach(p => setRole(p, team))
      const count = players.size()
      ctx.source.sendSuccess(Text.of(`${count} player(s) set to ${name}`), true)
      return count
    })

  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(Commands.literal('role')
        .then(Commands.argument('targets', Arguments.PLAYERS.create(event))
          .then(roleCmd('alien', ALIEN_TEAM))
          .then(roleCmd('human', HUMAN_TEAM))
          .then(roleCmd('none', null))))
      .then(Commands.literal('roles')
        .executes(ctx => {
          const server = ctx.source.server
          if (server.players.isEmpty()) {
            ctx.source.sendSystemMessage(Text.of('No players online'))
            return 0
          }
          server.players.forEach(p => {
            ctx.source.sendSystemMessage(Text.of(`${p.username}: ${roleOf(p) || 'none'}`))
          })
          return 1
        }))
  )
})
