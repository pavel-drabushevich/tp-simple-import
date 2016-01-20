/* jshint node:true, unused:true */
"use strict"

var _ = require('lodash');
var Q = require('q');
var winston = require('winston');
var commander = require('commander');
var ProgressBar = require('progress');
var csv = require('csv');
var rest = require('restler-q');

const config = require('./config');

commander
    .version('0.0.1')
    .option('-u, --url [value]', 'Targetprocess url')
    .option('-t, --token [value]', 'Targetprocess api token')
    .option('-f, --file [value]', 'File with Projects')
    .parse(process.argv);

var baseUrl = commander.url || 'http://localhost/targetprocess';
var apiUrl = `${baseUrl}/api`;
var apiV1Url = `${apiUrl}/v1`;
var apiV2Url = `${apiUrl}/v2`;
var token = commander.token || '';

var file = commander.file || 'Projects_List.csv';

var logger = new (winston.Logger)({
    transports: [new (winston.transports.File)({filename: 'import.log'})]
});

var postEntity = (type, entity) => rest
    .postJson(`${apiV1Url}/${type}?token=${token}`, entity)
    .fail(err => logger.log('error', `Fail to save ${type}: ${JSON.stringify(entity)}, error: ${err}`));

var buildWhere = keyValueQuery => {
    if (_.isString(keyValueQuery)) {
        return keyValueQuery;
    }
    return _.map(keyValueQuery, (value, key) => value.is ? key + ' ' + value.is : key + '=' + value)
        .join(' and ');
};
var buildQuery = querySpec => _.compact([
    querySpec.select ? `select={${querySpec.select.join(',')}}` : null,
    querySpec.where ? `where=(${buildWhere(querySpec.where)})` : null,
    `take=${(querySpec.take ? querySpec.take : 1000)}`,
    `token=${token}`
]).join('&');

var getEntities = (type, querySpec) => rest.get(`${apiV2Url}/${type}?${buildQuery(querySpec)}`)
    .then(response => response.items || [])
    .fail(err => logger.log('error', `Fail to get ${type} entities with query ${JSON.stringify(querySpec)}, error: ${JSON.stringify(err)}`));

var parseCSV = filePath => {
    var d = Q.defer();
    var rows = [];
    csv()
        .from.path(filePath, {columns: true})
        .on('record', row => rows.push(row))
        .on('end', () => d.resolve(rows));
    return d.promise;
};

var mkSavingBar = (entity, total) => new ProgressBar(`  ${entity} saving [:bar] :percent :etas`, {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: total
});

var mkEntity = (entityConfig, row, linkedEntities) => {
    var entity = {
        name: row[entityConfig.nameColumn]
    };
    _.forEach(entityConfig.linked, (l, i) => {
        var linkedValue = row[l.column];
        if (linkedValue) {
            var linkedEntity = _.find(linkedEntities[i], ['name', linkedValue.trim()]);
            if (linkedEntity) {
                entity[l.entity] = {id: linkedEntity.id};
            } else {
                logger.log('error', `Could not find '${linkedValue}' ${l.entity} to set for '${entity.name}'`);
            }
        }
    });
    entity.customFields = _.chain(entityConfig.customFields)
        .filter(cf => row[cf.column])
        .map(cf => ({name: cf.name, value: row[cf.column]}))
        .value();
    return entity;
};

var importEntities = (type, file, entityConfig) => {
    var linkedRequests = _.map(entityConfig.linked, l => getEntities(l.entity, l.querySpec));
    return Q.allSettled(linkedRequests)
        .then(responses => parseCSV(file).then(rows => {
            var bar = mkSavingBar(type, rows.length);
            var linkedEntities = _.map(responses, _.property('value'));
            var entities = _.chain(rows)
                .filter(_.property([entityConfig.nameColumn]))
                .map(row => mkEntity(entityConfig, row, linkedEntities));
            if (entityConfig.uniq) {
                entities = entities.uniqBy('name');
            }
            entities = entities.map(entity => postEntity(type, entity).then(() => bar.tick(1))).value();
            return Q.allSettled(entities);
        }));
};

var epicStateConfig = _.find(config.epics.linked, ['entity', 'entityState']);
var fixEpicStates = epicsFile => Q.allSettled([
    getEntities('epic', {select: ['id', 'name']}),
    getEntities(epicStateConfig.entity, epicStateConfig.querySpec)
]).then(responses => parseCSV(epicsFile).then(rows => {
    var toUpdate = _.filter(rows, row => row[epicStateConfig.column] && row[epicStateConfig.column] !== 'Active');
    var bar = mkSavingBar('epic states', toUpdate.length);
    var epics = responses[0].value;
    var entityStates = responses[1].value;
    var entities = _.chain(toUpdate)
        .map(row => {
            var epic = _.find(epics, ['name', row[config.epics.nameColumn]]);
            var entityState = _.find(entityStates, ['name', row[epicStateConfig.column]]);
            if (epic && entityState) {
                return {
                    id: epic.id,
                    entityState: {id: entityState.id}
                };
            }
        })
        .compact()
        .map(entity => postEntity('epics', entity).then(() => bar.tick(1)))
        .value();
    return Q.allSettled(entities);
}));

importEntities('programs', file, config.program)
    .then(() => importEntities('projects', file, config.project))
    .then(() => importEntities('epics', file, config.epics))
    .then(() => importEntities('features', file, config.features))
    // Fix epic states because they were reopend by TP due new open features
    .then(() => fixEpicStates(file))
    .then(() => console.log('Completed!'))
    .catch(error => logger.log('error', `Some unexpected errors happend: ${error}`))
    .done();
