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
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { promises } from "fs"
import { logError } from '@firebolt-js/openrpc/util/shared/helpers.mjs'

const { readFile, readdir } = promises

const knownOpts = {
  'input': [String, null],
  'schema': [path],
  'shared-schemas': [path]
}
const shortHands = {
  'i': '--input',
  's': '--schema',
  'ss': '--shared-schemas'
}
// Last 2 arguments are the defaults.
const parsedArgs = nopt(knownOpts, shortHands, process.argv, 2)
const signOff = () => console.log('\nThis has been a presentation of \x1b[38;5;202mFirebolt\x1b[0m \u{1F525} \u{1F529}\n')

const loadJson = file => readFile(file).then(data => JSON.parse(data.toString()))

const dirRecursive = async dir => {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? dirRecursive(res) : res;
    }));
    return Array.prototype.concat(...files);
}

const validate = async (jsonFile, schemaFile, shared) => {
    const json = await loadJson(jsonFile)
    const schema = await loadJson(schemaFile)
    const ajv = new Ajv({allErrors: true})

    shared.forEach(schema => ajv.addSchema(schema))
    addFormats(ajv)

    const validator = ajv.compile(schema)
    const valid = validator(json)

    if (valid) {
        console.log('Valid!')
    }
    else {
        const leftover = []
        validator.errors.forEach(error => {
            if (error.instancePath.startsWith("/capabilities/supported")) {
                if (error.instancePath.startsWith("/capabilities/supported/")) {
                    logError('Device schema is missing required capability:  \x1b[0m\x1b[38;5;202m' + error.params.allowedValue + '\x1b[0m')
                }
            }
            else if (error.instancePath.startsWith("/capabilities/grantPolicies/")) {
                logError('Device schema overrides unoverridable GrantPolicy:  \x1b[0m\x1b[38;5;202m' + error.instancePath.split("/").pop() + '\x1b[0m')
            }
            else {
                leftover.push(error)
            }
        })
        if (leftover.length) {
            console.dir(leftover)
        }
    }
}

//const schemas = await Promise.all(dirRecursive(parsedArgs['shared-schemas']).map(path => loadJson(path))

// locate all of the shared schemas and load them
const schemas = await Promise.all((await dirRecursive(parsedArgs['shared-schemas'])).map(path => loadJson(path)))
await validate(parsedArgs.input, parsedArgs.schema, schemas)

signOff()
