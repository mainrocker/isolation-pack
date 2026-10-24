// The motion tracker stays a script item; everything else a survivor carries comes from the mod.

StartupEvents.registry('item', event => {
  event.create('motion_tracker').displayName('Motion Tracker').texture('minecraft:item/clock_00').unstackable()
})
