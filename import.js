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
    .parse(process.argv);

var baseUrl = commander.url || 'http://localhost/targetprocess';
var apiUrl = `${baseUrl}/api`;
var apiV1Url = `${apiUrl}/v1`;
var apiV2Url = `${apiUrl}/v2`;
var token = commander.token || '';

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

var mkSavingBar = (entity, total) => new ProgressBar(`  ${entity} saving [:bar] :percent :etas`, {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: total
});

getEntities('user', {select: ['id', 'email'], where: {'isActive': true, 'deleteDate': 'null'}})
  .then(users => {
      var bar = mkSavingBar('assignments for all users', users.length);
      var updates = _.map(users, u => postEntity('userstories',
            {
              name: 'My story',
              project: {id: 213},
              assignments: [{role: {id: 1}, generalUser: {id: u.id}}]
            })
          .then(() => bar.tick(1)));
      return Q.allSettled(updates);
  })
  .catch(error => logger.log('error', `Some unexpected errors happend: ${error}`))
  .done();
