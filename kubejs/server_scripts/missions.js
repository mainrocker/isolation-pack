// priority: 55
// Mission steps. Each id needs a matching "/isolation mark objective <id>" on the map.
// A round picks a random handful of the ones that are marked in open sectors,
// then always finishes at an escape pod. Work a step by crouching next to its marker.

const MISSIONS = [
  { id: 'reactor', text: 'Restore power at the reactor', hold: 20, loud: true },
  { id: 'medical', text: 'Recover the access tuner from Medical', hold: 6, loud: false, reward: 'isolation:access_tuner' },
  { id: 'comms', text: 'Send a distress call from Comms', hold: 15, loud: true },
  { id: 'tram', text: 'Override the tram controls', hold: 12, loud: true },
  { id: 'security', text: 'Find the ion torch in Security', hold: 8, loud: false, reward: 'isolation:ion_torch' },
  { id: 'airlock', text: 'Cycle the cargo airlock', hold: 10, loud: true },
  // the rest only exist on the FEARLESS station
  { id: 'blackbox', text: 'Recover the black box in System Control', hold: 10, loud: false },
  { id: 'records', text: 'Pull the police records', hold: 8, loud: false },
  { id: 'cellblock', text: 'Unlock the cellblock terminal', hold: 12, loud: true },
  { id: 'habitat', text: 'Collect samples in the nature habitat', hold: 8, loud: false },
  { id: 'cargo', text: 'Read the cargo manifest in Cargo Control', hold: 8, loud: false },
  { id: 'codes', text: 'Copy the station codes in the main office', hold: 10, loud: false },
  { id: 'canteen', text: 'Gather food and water in the canteen', hold: 6, loud: true },
  { id: 'control', text: 'Override security in the control room', hold: 15, loud: true },
  { id: 'storage', text: 'Search the storage bunker', hold: 8, loud: true },
  { id: 'crew', text: 'Download the crew lists', hold: 10, loud: false },
]

const POD_STEP = { id: 'pod', text: 'Launch the escape pod', hold: 5, loud: true }

function missionById(id) {
  for (const m of MISSIONS) {
    if (m.id === id) return m
  }
  return null
}

// returns [{ mission, mark }], escape pod last
function planMissions(data, sectors, solo) {
  const range = solo ? CFG.missionSteps.solo : CFG.missionSteps.team
  const want = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1))
  const available = []
  MISSIONS.forEach(m => {
    const marks = marksOf(data, 'objective', sectors).filter(mk => mk.id === m.id)
    if (marks.length > 0) available.push({ mission: m, mark: pick(marks) })
  })
  const steps = shuffle(available).slice(0, want)
  const pods = marksOf(data, 'pod', sectors)
  if (pods.length > 0) steps.push({ mission: POD_STEP, mark: pick(pods) })
  return steps
}

function nearMark(p, mark) {
  return dist(mark.pos[0] + 0.5, mark.pos[1], mark.pos[2] + 0.5, p.x, p.y, p.z) <= CFG.interactRange + 0.5
}

// advance the current step; returns true when the final (pod) step completes
function missionTick(server, R, dt) {
  const step = R.steps[R.stepIndex]
  if (!step) return false
  const workers = livingHumans(server).filter(p => p.isCrouching() && nearMark(p, step.mark))
  if (workers.length > 0) {
    R.progress += dt
    let mark = step.mark
    let radius = step.mission.loud ? CFG.noise.objective : CFG.noise.quietObjective
    if (!throttled('objective', 2)) {
      soundAt(server, step.mission.loud ? 'minecraft:block.anvil.use' : 'minecraft:block.dispenser.dispense',
        mark.pos[0] + 0.5, mark.pos[1], mark.pos[2] + 0.5, 0.8, 0.7)
      makeNoise(server, mark.pos[0] + 0.5, mark.pos[1], mark.pos[2] + 0.5, radius, String(workers[0].username))
    }
  }
  if (R.progress < step.mission.hold) return false

  R.progress = 0
  R.stepIndex++
  mapsObjective(server)
  soundAt(server, 'minecraft:block.beacon.activate', step.mark.pos[0] + 0.5, step.mark.pos[1], step.mark.pos[2] + 0.5, 1, 1)
  // some steps hand the survivors a tool they'll need further on
  if (step.mission.reward) livingHumans(server).forEach(p => cmd(server, `give ${p.username} ${step.mission.reward}`))
  if (R.stepIndex >= R.steps.length) return true
  const next = R.steps[R.stepIndex]
  livingHumans(server).forEach(p => title(server, p.username, '', next.mission.text, 'white'))
  return false
}

function currentStep(R) {
  return R.steps[R.stepIndex] || null
}
