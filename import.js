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
var processEntityTypeId = 1;

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

var buildWhere = keyValueQuery => {
    if (_.isString(keyValueQuery)) {
        return keyValueQuery;
    }
    return _.map(keyValueQuery, (value, key) => value.is ? key + ' ' + value.is : key + '=' + value)
        .join(' and ');
}
var buildQuery = querySpec => _.compact([
    querySpec.select ? `select={${querySpec.select.join(',')}}` : null,
    querySpec.where ? `where=(${buildWhere(querySpec.where)})` : null,
    `take=${(querySpec.take ? querySpec.take : 1000)}`,
    `token=${token}`
]).join('&')

var getEntities = (type, querySpec) => rest.get(`${apiV2Url}/${type}?${buildQuery(querySpec)}`)
        .then(response => response.items || [])
        .fail(err => logger.log('error', `Fail to get  ${type} entities with query ${query}, error: ${JSON.stringify(err)}`));
var getSingleEntity = (type, querySpec, defaultValue) => getEntities(type, _.assignIn({take: 1} , querySpec))
    .then(entities => entities.length ? _.first(entities) : defaultValue);
var getDefaultProcessId = () => getSingleEntity('process', {select: ['id'], where: {'isDefault': true}}).then(p => p.id);
var getStates = entityTypeId => getDefaultProcessId()
    .then(processId => getEntities('entityState', {
        select: ['id', 'name'], 
        where: {'process.id': processId, 'entityType.id': entityTypeId }
    }));

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
        var programs = _.chain(rows)
            .filter(_.property([nameField]))
            .map(row => {
                var program = {
                    name: row[nameField]
                };
                return program;
            })
            .map(program => postProgram(program).then(() => bar.tick(1)))
            .value();
        return Q.allSettled(programs);
    });

var processProjects = projectsFile => {
    Q.allSettled([
        getStates(processEntityTypeId),
        getEntities('program', {select: ['id', 'name']})
    ]).then(a => {
        var states = a[0].value;
        var programs = a[1].value;
        return parseCSV(projectsFile)
            .then(rows => { 
                var bar = mkSavingBar(rows.length);
                var projects = _.chain(rows)
                    .filter(_.property([config.project.nameField]))
                    .map(row => {
                        var project = {
                            name: row[config.project.nameField]
                        };
                        if (row[config.project.programField]) {
                            var program = _.find(programs, ['name', row[config.project.programField]]);
                            if (program) {
                                project.program = {id: program.id};
                            }
                        }
                        if (row[config.project.stateField]) {
                            var state = _.find(states, ['name', config.project.stateField]);
                            if (state) {
                                project.entityState = {id: state.id};
                            }
                        }
                        project.customFields = _.compact(_.map(config.project.customFields, cf => {
                            if (row[cf]) {
                                return {
                                    name: cf,
                                    value: row[cf]
                                };
                            }
                        }));
                        return project;
                    })
                    .map(project => postProject(project).then(() => bar.tick(1)))
                    .value();
                return Q.allSettled(savePrograms);
            });
    });
};

console.log('Import programs...');
processPrograms(programsFile)
.then(() => {
    console.log('Import projects...');
    processProjects(projectsFile);
})
.then(() => console.log('Completed!'))
.catch(error => logger.log('error', `Some unexpected errors happend: ${error}`))
.done();
