const defaultQuerySpec = {select: ['id', 'name']}
var mkStatesQuerySpec = entityTypeId => ({select: ['id', 'name'], where: {'process.isDefault': true, 'entityType.id': entityTypeId }})

exports.program = {
    nameColumn: 'Program',
    uniq: true
};

exports.project = {
    nameColumn: 'Product',
    uniq: true,
    linked: [
        {entity: 'program', column: 'Program', querySpec: defaultQuerySpec},
        {entity: 'entityState', column: 'Product State', querySpec: mkStatesQuerySpec(1)}
    ],
    customFields: [
        {name: 'Product Type', column: 'Product Type'}
    ]
};

exports.epics = {
    nameColumn: 'Project / Operations',
    uniq: true,
    linked: [
        {entity: 'project', column: 'Product / Program', querySpec: defaultQuerySpec},
        {entity: 'entityState', column: 'Project State', querySpec: mkStatesQuerySpec(27)}
    ],
    customFields: [
        {name: 'Published under Brand', column: 'Published under Brand'},
        {name: 'Department Code', column: 'Department Code'},
        {name: 'Investment Type', column: 'Investment Type'},
        {name: 'Management Type', column: 'Management Type'},
        {name: 'Development Studio', column: 'Development Studio'},
        {name: 'Project State', column: 'Project State'},
        {name: 'Registration Date', column: 'Registration Date'},
        {name: 'Budget Owner', column: 'Budget Owner'}
    ]
};

exports.features = {
    nameColumn: 'Project Area / Activity',
    linked: [
        {entity: 'project', column: 'Product / Program', querySpec: defaultQuerySpec},
        {entity: 'epic', column: 'Project / Operations', querySpec: defaultQuerySpec}
    ],
    customFields: [
        {name: 'Development Studio', column: 'Development Studio'},
        {name: 'Department', column: 'Department'},
        {name: 'Sub - Department', column: 'Sub Department'}
    ]
};
