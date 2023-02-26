/*
 * Copyright 2022 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import nopt from 'nopt'
import path from 'path'

import readline from 'readline'

import { promises } from "fs"
import { logHeader, logSuccess, logInfo, logError } from '../../../node_modules/@firebolt-js/openrpc/util/shared/helpers.mjs'
const { readFile, writeFile } = promises

const knownOpts = {
    'mode': [String],
    'source': [path],
    'target': [path],
    'sdk': [String]
}
const shortHands = {
    'm': '--mode',
    's': '--source',
    't': '--target'
}
// Last 2 arguments are the defaults.
const parsedArgs = nopt(knownOpts, shortHands, process.argv, 2)
const signOff = () => console.log('\nThis has been a presentation of \x1b[38;5;202mFirebolt\x1b[0m \u{1F525} \u{1F529}\n')

const loadJson = file => readFile(file).then(data => JSON.parse(data.toString()))

const doImport = (sources, target, clear=false, report=false, reportUsed=false) => {
    const result = JSON.parse(JSON.stringify(target))

    if (clear && report) throw "Error, cannot clear and generate a report!"

    if (clear) {
        logSuccess(` - Clearing all capabilities.`)
        result.capabilities = {}
    }

    const capabilities = methods => methods.filter(m => m.tags && m.tags.find(t => t.name === "capabilities")).map(m => m.tags.find(t => t.name === "capabilities"))

    const source = sources.pop() || { methods: [] };
    sources.forEach(s => {
        source.methods.push(...s.methods)
    })

    const uses = Array.from(new Set(capabilities(source.methods).filter(c => c['x-uses']).map(c => c['x-uses']).flat()))
    const manages = Array.from(new Set(capabilities(source.methods).filter(c => c['x-manages']).map(c => c['x-manages']).flat()))
    const provides = Array.from(new Set(capabilities(source.methods).filter(c => c['x-provides']).map(c => c['x-provides']).flat()))
    const all = Array.from(new Set(uses.concat(manages).concat(provides))).sort()

    all.forEach(capability => {
      if (!result.capabilities[capability]) {
          logSuccess(` - ${report ? 'Missing' : 'Adding'} capability ${capability}.`)
      }
      result.capabilities[capability] = Object.assign({
          level: 'must',
          use: {
              public: uses.includes(capability),
              negotiable: true && uses.includes(capability)
          },
          manage: {
              public: manages.includes(capability),
              negotiable: true && manages.includes(capability)
          },
          provide: {
              public: provides.includes(capability),
              negotiable: true && provides.includes(capability)
          }
      }, result.capabilities[capability] || {})
      if (uses.includes(capability) != result.capabilities[capability].use.public) {
          logSuccess(` - ${report ? 'Incorrect' : 'Setting'} use.public: ${uses.includes(capability)} for ${capability}.`)
          result.capabilities[capability].use.public = uses.includes(capability)
      }
      if (manages.includes(capability) != result.capabilities[capability].manage.public) {
          logSuccess(` - ${report ? 'Incorrect' : 'Setting'} manage.public: ${manages.includes(capability)} for ${capability}.`)
          result.capabilities[capability].manage.public = manages.includes(capability)
      }
      if (provides.includes(capability) != result.capabilities[capability].provide.public) {
          logSuccess(` - ${report ? 'Incorrect' : 'Setting'} provides.public: ${provides.includes(capability)} for ${capability}.`)
          result.capabilities[capability].provide.public = provides.includes(capability)
      }
    })

    if (report) {
        const unused = []
        const useCaps = []
        const manageCaps = []
        const provideCaps = []
        Object.entries(result.capabilities).forEach(([capability, policy]) => {
            const uses = source.methods.filter(m => m.tags && m.tags.find(t => t.name === "capabilities") && m.tags.find(t => t.name === "capabilities")['x-uses'] && m.tags.find(t => t.name === "capabilities")['x-uses'].includes(capability))
            const provides = source.methods.filter(m => m.tags && m.tags.find(t => t.name === "capabilities") && m.tags.find(t => t.name === "capabilities")['x-provides'] && m.tags.find(t => t.name === "capabilities")['x-provides'] === capability)
            const manages = source.methods.filter(m => m.tags && m.tags.find(t => t.name === "capabilities") && m.tags.find(t => t.name === "capabilities")['x-manages'] && m.tags.find(t => t.name === "capabilities")['x-manages'].includes(capability))

            if ((uses.length + provides.length + manages.length) > 0) {
                logHeader(capability)
                uses.forEach(m => logSuccess(' - use    : ' + m.name))
                if (uses.length === 0) {
                    logInfo(' - use    : none')
                }
                else {
                    useCaps.push(capability)
                }

                manages.forEach(m => logSuccess(' - manage : ' + m.name))
                if (manages.length === 0) {
                    logInfo(' - manage : none')
                }
                else {
                    manageCaps.push(capability)
                }

                provides.forEach(m => logSuccess(' - provide: ' + m.name))
                if (provides.length === 0) {
                    logInfo(' - provide: none')
                }
                else {
                    provideCaps.push(capability)
                }

                console.log()
            }
            else {
                unused.push(capability)
            }
        })

        if (reportUsed) {
            logHeader('Used capabilities:')

            console.log(JSON.stringify({
                use: useCaps,
                manage: manageCaps,
                provide: provideCaps
            }, null, '\t'))

            console.log()
        }

        logHeader('Unused capabilities:')
        unused.forEach(c => console.log("'" + c + "',"))
    }

    return result
}

const core = './node_modules/@firebolt-js/sdk/dist/firebolt-open-rpc.json'
const manage = './node_modules/@firebolt-js/manage-sdk/dist/firebolt-manage-open-rpc.json'
const version = await loadJson(parsedArgs.source)
const sdks = [core, manage]
let clear = false
let write = false
let report = false
let reportUsed = false

if (parsedArgs.mode === 'clear') {
    while (sdks.length) sdks.pop()
    clear = true
    write = true
}
else if (parsedArgs.mode === 'add') {
    clear = false
    write = true
}
else if (parsedArgs.mode === 'report') {
    write = false
    report = true

    if (parsedArgs.sdk) {
        reportUsed = true
        let sdk = sdks.find(s => s.indexOf('/' + parsedArgs.sdk + '/') >= 0)
        sdks.length = 0;
        sdks.push(sdk)
    }
}

logHeader(`Capabilities - Running ${parsedArgs.mode}`)

const sdkJson = await Promise.all(sdks.map(loadJson))
const result = JSON.stringify(doImport(sdkJson, version, clear, report, reportUsed), null, '  ')

if (write) {
  await writeFile(parsedArgs.target, result)
  signOff()
  process.exit(0);
}
else {
    signOff()
}
