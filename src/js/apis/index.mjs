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

import { logHeader, logSuccess, logInfo, logError } from '../../../node_modules/@firebolt-js/openrpc/src/shared/io.mjs'

import { promises } from "fs"

const { readFile, writeFile } = promises

const knownOpts = {
  'mode': [String, null],
  'source': [String, null],
  'target': [String, null]
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
const loadJsonTree = async file => {
    const json = await loadJson(file)
    const dir = path.join('.', path.dirname(file))
    const find = (tree, prop, value) => {
        const results = []
        Object.keys(tree).map(key => {
            if (key.match(prop) && tree[key].match(value)) {
                results.push({
                    parent: tree,
                    property: key,
                    value: tree[key]
                })
            }
            else if (typeof tree[key] === 'object' && Object.keys(tree[key]).length){
                results.push(...find(tree[key], prop, value))
            }
        })
        return results
    }

    const promises = []
    find(json, /^\$ref$/, new RegExp("^" + json.$id)).map(result => {
        const file = path.join('.' + result.value.substr(json.$id.length), result.value.split("/").pop() + ".json")
        const root = json
        promises.push(loadJsonTree(path.join(dir, file)).then(json => {
            delete result.parent[result.property]
            Object.assign(result.parent, json)
            if (json.definitions) {
                root.definitions = root.definitions || {}
                Object.assign(root.definitions, json.definitions)
                delete result.parent.definitions
            }
            delete result.parent.$id
        }))
    })

    return Promise.all(promises).then(_ => json)
}

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

const equals = (a, b, ignore=[]) => {
    return !diff(a, b, ignore)
}

const diff = (a, b, ignore=[]) => {
    if (typeof a !== typeof b) {
        return true
    }

    if (['string', 'boolean', 'number'].includes(typeof a)) {
        return !(a === b)
    }
    else if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) {
            return true
        }

        if (Array.isArray(a)) {
            if (a.length !== b.length) {
                return true
            }

            for (var i=0; i<a.length; i++) {
                if (!equals(a[i], b[i], ignore)) {
                    return true
                }
            }
        }
        else {
            const diffs = {
                removed: [],
                added: [],
                changed: []
            }

            const keysA = Object.keys(a).sort().filter(k => !ignore.includes(k))
            const keysB = Object.keys(b).sort().filter(k => !ignore.includes(k))

            if (diff(keysA, keysB, ignore)) {
                diffs.removed = keysA.filter(x => !keysB.includes(x))
                diffs.added = keysB.filter(x => !keysA.includes(x))
            }

            const keys = keysA.filter(k => keysB.includes(k))
            for (var i=0; i<keys.length; i++) {
                const subdiffs = diff(a[keys[i]], b[keys[i]], ignore)
                if (subdiffs) {
                    subdiffs.added && subdiffs.added.forEach(p => diffs.added.push(keys[i] + '.' + p))
                    subdiffs.removed && subdiffs.removed.forEach(p => diffs.removed.push(keys[i] + '.' + p))
                    if (subdiffs.changed && subdiffs.changed.length) {
                        subdiffs.changed && subdiffs.changed.forEach(p => diffs.changed.push(keys[i] + '.' + p))
                    }
                    else {
                        diffs.changed.push(keys[i])
                    }
                }
            }
            if (diffs.removed.length > 0 || diffs.added.length > 0 || diffs.changed.length > 0) {
                return diffs
            }
        }
    }
    return false
}

const dotGet = (obj, path) => {
    let o = obj
    try {
        path.split(".").forEach(p => o = o[p])
        return o
    }
    catch (e) {
        return null
    }
}

const ignore = [ 'summary', 'examples', 'result.name', 'x-property-type' ]

const mergeRpc = (sdks, verbose=false) => {
    const result = JSON.parse(JSON.stringify(sdks.shift()))
    result.components = result.components || {}
    result.components.schemas = result.components.schemas || {}

    logHeader('Merging the SDKs')

    sdks.forEach( sdk => {
        // merge methods
        sdk.methods && sdk.methods.forEach(method => {
            if (method.name === 'rpc.discover') {
                return
            }

            const dupe = result.methods.find(m => m.name === method.name)

            if (dupe) {
                const otherSdk = sdks.find(s => s != sdk && s.methods.find(m => m.name === method.name)) || result
                if (!equals(method, dupe, ignore)) {
                    const diffs = diff(method, dupe, ignore)

                    if (diffs) {
                        diffs.added = diffs.added.filter(v => !ignore.find(i => i === v || v.endsWith('.' + i)))
                        diffs.removed = diffs.removed.filter(v => !ignore.find(i => i === v || v.endsWith('.' + i)))
                        diffs.changed = diffs.changed.filter(v => !ignore.find(i => i === v || v.endsWith('.' + i)))

                        if (diffs.added.length > 0 || diffs.removed.length > 0 || diffs.changed.length > 0) {
                            if (verbose) {
                                diffs.changed.forEach(changed => {
                                    logError(`Method '${method.name}' has different value for '${changed}':\n`)
                                    console.log(">>>>>>")
                                    console.dir(dotGet(method, changed), { depth: 100 })
                                    console.log("======")
                                    console.dir(dotGet(dupe, changed), { depth: 100 })
                                    console.log("<<<<<<\n")
                                })
                            }
                            else {
                                logError(`Method '${method.name} has different schemas in ${otherSdk.info.title} and ${sdk.info.title}.`)
                            }
                        }
                        else {
                            logSuccess(`Method '${method.name}' has matching schemas.`)
                        }
                    }
                    else {
                        logSuccess(`Method '${method.name}' has matching schemas.`)
                    }
                }
                else {
                    logSuccess(`Method '${method.name}' has matching schemas.`)
                }
            }
            else {
                result.methods.push(method)
            }
        })

        // merge components.schemas
        if (sdk.components) {
            sdk.components.schemas && Object.entries(sdk.components.schemas).forEach( ([key, value]) => {
                if (result.components.schemas[key]) {
                    const diffs = diff(result.components.schemas[key], value, ignore)

                    if (diffs && (diffs.added.length > 0 || diffs.removed.length > 0 || diffs.changed.length > 0)) {
                        if (verbose) {
                            diffs.changed.forEach(changed => {
                                logError(`Schema '${key}' has different value for '${changed}':\n`)
                                console.log(">>>>>>")
                                console.dir(dotGet(result.components.schemas[key], changed), { depth: 100 })
                                console.log("======")
                                console.dir(dotGet(value, changed), { depth: 100 })
                                console.log("<<<<<<\n")
                            })
                        }
                        else {
                            logError(`Schema '${key} is different in ${sdk.info.title}.`)
                        }
                    }
                    else {
                        logSuccess(`Schema '${key}' has matching definitions.`)
                    }
                }
                else {
                    result.components.schemas[key] = value
                }
            })
        }
    })

    result.methods.sort()
    return result
}

const version = await loadJson(parsedArgs.source)
const core = await loadJson('./node_modules/@firebolt-js/sdk/dist/firebolt-core-open-rpc.json')
const manage = await loadJson('./node_modules/@firebolt-js/manage-sdk/dist/firebolt-manage-open-rpc.json')

let write = false
let verbose = false

if (parsedArgs.mode === 'report') {
    verbose = true
}
else if (parsedArgs.mode === 'clear') {
    version.apis = {}
    write = true
}

const rpc = mergeRpc([core, manage], verbose)

if (parsedArgs.mode === 'import') {
    const major = core.info.version.split(".").shift()
    version.apis = version.apis || {}
    version.apis[major] = rpc
    write = true
}

if (write) {
    await writeFile(parsedArgs.target, JSON.stringify(version, null, '  '))
}

signOff()
