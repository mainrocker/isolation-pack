// priority: 100
// Balance for the round. The numbers and switches are game settings, kept by the mod in
// <world>/serverconfig/isolation-server.toml and changed in game on G (operators only); this
// copies them into CFG. What stays here are the lists.
// Times are seconds, distances are blocks. "solo" = exactly one human in the round, "team" = two or more.

const $Settings = Java.loadClass('com.isolation.IsolationConfig')
const $SettingsSync = Java.loadClass('com.isolation.SettingsSync')

const CFG = {
  // what every survivor starts with
  kit: ['kubejs:motion_tracker', 'isolation:maintenance_jack'],
  // goes in the off hand, so it shines while the tracker is held
  flashlight: 'halogen:flashlight',

  // which sectors are open for a given number of humans; more humans than listed = everything open
  sectorsByHumans: {
    1: ['core', 'east'],
    2: ['core', 'east'],
  },
  bulkheadBlock: 'minecraft:iron_block',

  // [effect, amplifier]. Resistance 4 makes the alien immune. Kills are grabs, handled by the mod.
  alienEffects: [
    ['minecraft:speed', 1],
    ['minecraft:jump_boost', 0],
    ['minecraft:resistance', 4],
    ['minecraft:saturation', 0],
  ],
  // humans have stamina instead of hunger (the mod's Stamina), so no saturation here
  humanEffects: [],
}

function setting(id) {
  return Number($Settings.number(id))
}

// fills CFG from the game settings; cheap, so the round loop runs it every half second
function loadSettings() {
  CFG.countdown = setting('round.countdown')
  CFG.alienReleaseDelay = setting('round.alienReleaseDelay')
  CFG.endScreen = setting('round.endScreen')
  CFG.roundMinutes = { solo: setting('round.minutesSolo'), team: setting('round.minutesTeam') }
  // [min, max] mission steps before the escape pod
  CFG.missionSteps = {
    solo: [setting('round.stepsSoloMin'), Math.max(setting('round.stepsSoloMin'), setting('round.stepsSoloMax'))],
    team: [setting('round.stepsTeamMin'), Math.max(setting('round.stepsTeamMin'), setting('round.stepsTeamMax'))],
  }
  CFG.podWait = setting('round.podWait')
  CFG.podRadius = setting('round.podRadius')
  CFG.pressureAssistAfter = { solo: setting('round.assistSolo'), team: setting('round.assistTeam') }
  CFG.pressureHintEvery = setting('round.hintEvery')
  CFG.twoAliensAt = setting('round.twoAliensAt')
  CFG.workingJoes = setting('round.workingJoes') >= 0.5

  CFG.interactRange = setting('humans.interactRange')
  CFG.stationRegisterTime = setting('humans.stationRegisterTime')
  CFG.reviveTime = setting('humans.reviveTime')
  CFG.soloRespawnDelay = setting('humans.soloRespawnDelay')
  CFG.tracker = { range: setting('humans.trackerRange') }

  // noise radius per action, 0 = silent
  CFG.noise = {
    walk: setting('noise.walk'),
    sprint: setting('noise.sprint'),
    door: setting('noise.door'),
    objective: setting('noise.objective'),
    quietObjective: setting('noise.quietObjective'),
    station: setting('noise.station'),
    tracker: setting('noise.tracker'),
  }
  CFG.noiseShowSeconds = setting('noise.showSeconds')
  // a noise carries this many times its radius to the alien, and one this loud or louder anywhere
  CFG.noiseHearing = setting('noise.hearing')
  CFG.noiseHeardEverywhere = setting('noise.heardEverywhere')

  CFG.loot = { baseChance: setting('loot.baseChance'), perHuman: setting('loot.perHuman') }
}

// changes a game setting for everyone, as if from the settings screen
function changeSetting(id, value) {
  $SettingsSync.set(id, value)
  loadSettings()
}

loadSettings()
