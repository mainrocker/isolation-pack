// priority: 20
// Working Joes: optional androids that hunt the humans and leave the alien alone.
// They come out at joe_spawn marks in open sectors when the alien is released.
//
//   /isolation joes on|off|status

function spawnJoes(server) {
  const data = loadMarks(server)
  marksOf(data, 'joe_spawn', R.sectors).forEach(m => {
    cmd(server, `summon isolation:working_joe ${m.pos[0] + 0.5} ${m.pos[1]} ${m.pos[2] + 0.5}`)
  })
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event
  const set = on => safely(ctx => {
    changeSetting('round.workingJoes', on ? 1 : 0)
    ctx.source.sendSuccess(Text.of(`Working Joes ${on ? 'on' : 'off'} from the next round`), true)
    return 1
  })

  event.register(
    Commands.literal('isolation')
      .requires(src => src.hasPermission(2))
      .then(Commands.literal('joes')
        .then(Commands.literal('on').executes(set(true)))
        .then(Commands.literal('off').executes(set(false)))
        .then(Commands.literal('status').executes(safely(ctx => {
          ctx.source.sendSystemMessage(Text.of(`Working Joes are ${CFG.workingJoes ? 'on' : 'off'}`))
          return 1
        }))))
  )
})
