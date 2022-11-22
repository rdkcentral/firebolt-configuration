firebolt-configuration
======================

This repository contains JSON Schema specifications for any/all Firebolt configuration files.

Note this repository contains "source files", which are processed by tooling to product final JSON Schema files, which are put in https://meta.rdkcentral.com/firebolt/configuration/(version)/.


# Developer Notes

When making changes to the JSON schema files in this repository, you should use `npm run validate` to validate that your JSON schemas are all valid.

## App Manifests
TBD...

## Version Manifests
A Firebolt Version Manifest describes the requirements for that particular version of Firebolt.

It must be a valid version-manifest JSON document (per schemas/version-manifest).

The file in ./src/json/firebolt.json contains any editorial values, e.g. non-negotiable capabilities and grant policies.

Running:

```
npm run build:version
```

Will copy src/json/firebolt.json to dist/json/firebolt.json and then scan the Manage and Core SDKs for capabilities and APIs and add any that are missing. This allows the editorial file in src to only contain exceptions to our default import rules, making it easier to maintain.

You can run:

```
npm run validate:version
```

to show that the firebolt.json in /dist/ is valid.

You can run:

```
npm run apis:report
```

or

```
npm run capabilities:report
```

To get useful details about the APIs & Capabilties in dist/json/firebolt.json

## Device Manifests
A Firebolt Device Manifest describes the configuration for a particular device running  Firebolt.

It must be a valid device-manifest JSON document (per schemas/device-manifest).

The file in ./src/json/devices/reference.json contains an example.

You can run:

```
npm run validate:device
```

to show that the reference.json is valid.