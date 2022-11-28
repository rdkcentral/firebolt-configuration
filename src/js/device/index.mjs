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

import { promises } from "fs"
import { existsSync } from 'fs'

const { readFile, writeFile } = promises

const knownOpts = {
  'input': [String, null],
  'output': [path]
}
const shortHands = {
  'i': '--input',
  'o': '--output'
}

// Last 2 arguments are the defaults.
const parsedArgs = nopt(knownOpts, shortHands, process.argv, 2)
const signOff = () => console.log('\nThis has been a presentation of \x1b[38;5;202mFirebolt\x1b[0m \u{1F525} \u{1F529}\n')

const loadJson = file => readFile(file).then(data => JSON.parse(data.toString()))

const generate = async (jsonFile) => {
    const json = await loadJson(jsonFile)
    const schema = {
        $id: "https://meta.rdkcentral.com/firebolt/generated",
        definitions: {} }

    // Generate schema that asserts each device has all 'must' capabilities in the supported array.
    schema.definitions.AllMustCapabilities = {
        allOf: Object.entries(json.capabilities).filter(([capability, policy]) => policy.level === 'must').map(([capability, config]) => ({
            type: "array",
            contains: {
                const: capability
            }
        }))
    }

    // Generate a schema that asserts that a device does not override a grant policy set to overridable: false in the version manifest
    schema.definitions.GrantPolicyOverrides = {
        type: "object",
        properties: Object.fromEntries(Object.entries(json.capabilities).map(([capability, policy]) => {
            const unoverridable = ["use", "manage", "provide"]
                                    .filter(role => policy[role].grantPolicy && !policy[role].grantPolicy.overridable)

            const result = {
                type: "object",
            }

            if (unoverridable.length) {
                result.not = {
                    required: unoverridable
                }
            }

            return [capability, result]

        }).filter(([capability, policy]) => policy.not))
    }

    return schema
}

const generated = await generate('./dist/json/firebolt.json')
const target = await loadJson(parsedArgs.input)

if (generated.definitions && !target.definitions) {
    target.definitions = {}
}
Object.assign(target.definitions, generated.definitions)

await writeFile(parsedArgs.output, JSON.stringify(target, null, '  '))

signOff()
