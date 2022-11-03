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
        let file = path.join('.' + result.value.substr(json.$id.length), result.value.split("/").pop() + ".json")
        const root = json
        if (!existsSync(path.join(dir, file))) {
            file = path.join('.' + result.value.substr(json.$id.length) + ".json")
        }
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

const merged = await loadJsonTree(parsedArgs.input)

await writeFile(parsedArgs.output, JSON.stringify(merged, null, '\t'))

signOff()