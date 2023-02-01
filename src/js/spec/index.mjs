import { promises } from 'fs'
const { readFile, writeFile } = promises

const run = async () => {
  const RPC = JSON.parse(await readFile('./dist/json/firebolt.json'))
  const majors = Object.keys(RPC.apis)
  for (let i = 0; i < majors.length; i++) {
    let version = RPC.apis[majors[i]].info.version
    if (version.indexOf('-') !== -1) {
      version = version.substring(0, version.indexOf('-')) // strip pre-release
    }
    writeFile('specs/firebolt-' + version + '.json', JSON.stringify(RPC, null, 2))
  }
}

run()
