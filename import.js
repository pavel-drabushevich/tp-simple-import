/* jshint node:true, unused:true */
"use strict";

var _           = require('lodash');
var Q           = require('q');
var winston     = require('winston');
var commander   = require('commander');
var ProgressBar = require('progress');
var async       = require('async');
var csv         = require('csv');
var rest        = require('restler-q');

const config    = require('./config');

commander
    .version('0.0.1')
    .option('-u, --url [value]', 'Targetprocess url')
    .option('-t, --token [value]', 'Targetprocess api token')
    .option('-p, --programs [value]', 'File with Programs')
    .option('-pr, --projects [value]', 'File with Projects')
    .option('-e, --epics [value]', 'File with Epics')
    .option('-f, --features [value]', 'File with Features')
    .parse(process.argv);

var baseUrl = commander.url || 'http://localhost/targetprocess';
var apiUrl =  `${baseUrl}/api`;
var apiV1Url =  `${apiUrl}/v1`;
var apiV2Url =  `${apiUrl}/v2`;
var token = commander.token || '';

var programsFile = commander.programs || 'Portfolio_Programs.csv';
var projectsFile = commander.projects || 'Portfolio_Projects.csv';
var epicsFile = commander.epics || 'Portfolio_Epics.csv';
var featuresFile = commander.features || 'Portfolio_Features.csv';

var logger = new (winston.Logger)({
    transports: [new (winston.transports.File)({ filename: 'import.log' })]
});

// REST
var postEntity = (type, entity) => rest
    .postJson(`${apiV1Url}/${type}?token=${token}`, entity)
    .fail(err => logger.log('error', `Fail to save ${type}: ${entity.name}, error: ${err}`));
var postProgram = postEntity.bind(null, 'programs');
var postProject = postEntity.bind(null, 'projects');
var postEpic = postEntity.bind(null, 'epics');
var postFeature = postEntity.bind(null, 'features');


var parseCSV = filePath => {
    var d = Q.defer();
    var rows = [];
    csv()
    .from.path(filePath, {columns: true})
    .on('record', row => rows.push(row))
    .on('end', () => d.resolve(rows));
    return d.promise;
};

var mkSavingBar = total => new ProgressBar('  saving [:bar] :percent :etas', {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: total
});

var processPrograms = programsFile => parseCSV(programsFile)
    .then(rows => { 
        const nameField = config.program.nameField;
        var bar = mkSavingBar(rows.length);
        var savePrograms = _.map(rows, row => {
            if (row[nameField]) {
                return postProgram({name: row[nameField]}).then(() => bar.tick(1));
            } else {
                logger.log('error', `Entity ${JSON.stringify(row)} does not have '${nameField}' attribute`);
            }
        });
        return Q.allSettled(savePrograms);
    });

processPrograms(programsFile)
.then(() => console.log('complete'));
