import { promises } from 'fs'
const { readFile, writeFile } = promises
const RPC = JSON.parse(readFile('dist/json/firebolt.json'))
const majors = Object.keys(RPC.apis)
for (let i = 0; i < majors.length; i++) {
  const version = RPC.apis[majors[i]].info.version
  writeFile('specs/firebolt-' + version + '.json', JSON.stringify(RPC))
}
