Simple [Node.js](https://nodejs.org) script to import entities from CSV files to [Targetprocess](https://targetprocess.com). Tested on v4.2.4.

Please run `npm install` command to install dependencies

Script has several parametrs, run `node import.js -h` command to see help. Csv files paths options have default values, please see begining of [import.js](https://github.com/pavel-drobushevich/tp-simple-import/blob/master/import.js) and files in this repository. But Targetprocess url and api token are important.

For example you can start import with following command

```
node import.js -u http://targetprocess -t MTpGMjRERDMxODUzNDkasGHDsdQ0NEY4NkFFOEJCMjkzMw==

```

Please open `<targetprocess_url>/api/v1/Authentication` page in your browser to get Targetprocess API token.

All errors are saved to `import.log` in current directory.

[config.js](https://github.com/pavel-drobushevich/tp-simple-import/blob/master/config.js) file contains configuration for this script, for example CSV columns mappings to Targetprocess fields. Current configuration based on sample files in this repository.

Note: this script just import data, so before run it please setup workflow and create custom fields.
