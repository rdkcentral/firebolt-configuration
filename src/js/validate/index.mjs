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
import fetch from 'node-fetch';

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

const replaceUri = (existing, replacement, schema) => {
    if (schema && schema.hasOwnProperty && schema.hasOwnProperty('$ref') && (typeof schema['$ref'] === 'string')) {
        if (schema['$ref'].indexOf(existing) === 0) {
            schema['$ref'] = schema['$ref'].split('#').map(x => x === existing ? replacement : x).join('#')
        }
    }
    else if (schema && (typeof schema === 'object')) {
        Object.keys(schema).forEach(key => {
            replaceUri(existing, replacement, schema[key])
        })
    }
}

const removeIgnoredAdditionalItems = schema => {
    if (schema && schema.hasOwnProperty && schema.hasOwnProperty('additionalItems')) {
        if (!schema.hasOwnProperty('items') || !Array.isArray(schema.items)) {
            delete schema.additionalItems
        }
    }
    else if (schema && (typeof schema === 'object')) {
        Object.keys(schema).forEach(key => removeIgnoredAdditionalItems(schema[key]))
    }
}

const validate = async (jsonFile, schemaFile, shared) => {
    const json = await loadJson(jsonFile)
    const schema = await loadJson(schemaFile)
    const ajv = new Ajv({allErrors: true})
    addFormats(ajv)
    ajv.addVocabulary(['x-method', 'x-this-param', 'x-additional-params'])

    shared.forEach(schema => ajv.addSchema(schema))

    let openrpc = await (await fetch('https://meta.open-rpc.org', { method: 'GET' })).json()
    removeIgnoredAdditionalItems(openrpc)
    replaceUri('https://raw.githubusercontent.com/json-schema-tools/meta-schema/1.5.9/src/schema.json', 'https://meta.json-schema.tools/', openrpc)
    let jsonschemaTools = await (await fetch('https://meta.json-schema.tools/', { method: 'GET' })).json()
    ajv.addSchema(jsonschemaTools)
    ajv.addSchema(openrpc)

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
const run = async () => {
    const schemas = await Promise.all((await dirRecursive(parsedArgs['shared-schemas'])).map(path => loadJson(path)))
    await validate(parsedArgs.input, parsedArgs.schema, schemas)
}

run().then(() => {
    signOff()
})
