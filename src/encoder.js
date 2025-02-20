import {_enum} from './enum';

// Encodes a graphql query
const graphqlify = function (fields) {
  return encodeOperation('', fields);
};

// Encodes a graphql query
graphqlify.query = function (_nameOrFields, _fieldsOrNil) {
  return encodeOperation('query', _nameOrFields, _fieldsOrNil);
};

// Encodes a graphql mutation
graphqlify.mutation = function (_nameOrFields, _fieldsOrNil) {
  return encodeOperation('mutation', _nameOrFields, _fieldsOrNil);
};

// Encodes a graphql operation and fragments
// The output is a complete graphql query.
//
//   {a: {fields: {b: 1}}}  => '{a{b}}'
//   'mutation', {a: {fields: {b: 1}}}  => 'mutation{a{b}}'
//
function encodeOperation(type, _nameOrFields, _fieldsOrNil) {
  let name = _nameOrFields;
  let fields = _fieldsOrNil;
  if (!_fieldsOrNil && typeof _nameOrFields === 'object') {
    name = null;
    fields = _nameOrFields;
  }

  const parts = [];

  // stringifying the main query object
  const fieldset = encodeFieldset(fields, null);

  if (name) {
    parts.push(`${type} ${name}${fieldset}`);
  } else {
    parts.push(`${type}${fieldset}`);
  }

  const fragments = findFragments(fields);
  if (fragments.length) {
    parts.push(encodeFragments(fragments));
  }

  return parts.join(',');
}

// TODO add function description
function findFragments(fields) {
  const fragments = Object.keys(fields)
    .filter(key => fields[key] && typeof fields[key] === 'object')
    .map(key => findFieldFragments(fields[key]))
    .reduce((a, b) => a.concat(b), []);
  return Array.from(new Set(fragments));
}

// TODO add function description
function findFieldFragments(field) {
  let fragments = [];
  if (field.fragments) {
    fragments = fragments.concat(field.fragments);
    field.fragments.forEach(frag => {
      const fragFragments = findFragFragments(frag);
      fragments = fragments.concat(fragFragments);
    });
  }
  if (field.fields) {
    fragments = fragments.concat(findFragments(field.fields));
  }
  return fragments;
}

// TODO add function description
function findFragFragments(frag) {
  let fragments = [];
  if (frag.fragments) {
    fragments = fragments.concat(frag.fragments);
    frag.fragments.forEach(nestedFrag => {
      const fragFragments = findFragFragments(nestedFrag);
      fragments = fragments.concat(fragFragments);
    });
  }
  if (frag.fields) {
    fragments = fragments.concat(findFragments(frag.fields));
  }
  return fragments;
}

// TODO add function description
function encodeFragments(fragments) {
  return fragments.map(f => encodeFragment(f)).join(',');
}

// TODO add function description
function encodeFragment(fragment) {
  const fieldset = encodeFieldset(fragment.fields, fragment.fragments);
  return `fragment ${fragment.name} on ${fragment.type}${fieldset}`;
}

// Encodes a group of fields and fragments
// The output is a piece of a graphql query.
//
//   {a: 1, b: true, c: {}} => '{a,b,c}'
//   {a: {fields: {b: 1}}}  => '{a{b}}'
//
function encodeFieldset(fields, fragments) {
  const parts = [];
  if (fields) {
    parts.push(encodeFields(fields));
  }
  if (fragments) {
    fragments.forEach(f => parts.push(`...${f.name}`));
  }
  return `{${parts.join(',')}}`;
}

// Encodes a set of fields and nested fields.
// The output is a piece of a graphql query.
//
//   {a: 1, b: true, c: {}} => 'a,b,c'
//   {a: {fields: {b: 1}}}  => 'a{b}'
//
function encodeFields(fields) {
  if (!fields || typeof fields !== 'object') {
    throw new Error(`fields cannot be "${fields}"`);
  }

  const encoded = Object.keys(fields).filter(function (key) {
    return fields.hasOwnProperty(key) && fields[key];
  }).map(function (key) {
    return encodeField(key, fields[key]);
  });

  if (encoded.length === 0) {
    throw new Error(`fields cannot be empty`);
  }

  return encoded.join(',');
}

// Encode a single field and nested fields.
// The output is a piece of a graphql query.
//
//   ('a', 1)                 => 'a'
//   ('a', {field: 'aa'})     => 'a:aa'
//   ('a', {params: {b: 10}}) => 'a(b:10)'
//   ('a', {fields: {b: 10}}) => 'a{b}'
//
function encodeField(key, val) {
  if (typeof val !== 'object') {
    return key;
  }

  const parts = [ key ];

  if (val.field) {
    parts.push(`:${val.field}`);
  }
  if (val.params) {
    parts.push(encodeParams(val.params));
  }
  if (val.fields || val.fragments) {
    parts.push(encodeFieldset(val.fields, val.fragments));
  }

  return parts.join('');
}

// Encodes a map of field parameters.
//
//   {a: 1, b: true} => '(a:1,b:true)'
//   {a: ['b', 'c']} => '(a:["b","c"])'
//   {a: {b: 'c'}}   => '(a:{b:"c"})'
//
function encodeParams(params) {
  const encoded = encodeParamsMap(params);
  if (encoded.length === 0) {
    throw new Error(`params cannot be empty`);
  }

  return `(${encoded.join(',')})`;
}

// Encodes an object type field parameter.
//
//   {a: {b: {c: 10}}} => '{a:{b:{c:10}}}'
//   {a: {b: false}}   => '{a:{b:false}}'
//
function encodeParamsObject(params) {
  const encoded = encodeParamsMap(params);
  return `{${encoded.join(',')}}`;
}

// Encodes an array type field parameter.
//
//   [1, 2, 3]          => '[1,2,3]'
//   [ {a: 1}, {a: 2} ] => '[{a:1},{a:2}]'
//
function encodeParamsArray(array) {
  const encoded = array.map(encodeParamValue);
  return `[${encoded.join(',')}]`;
}

// Encodes a map of field parameters.
//
//   {a: 1, b: true} => 'a:1,b:true'
//   {a: ['b', 'c']} => 'a:["b","c"]'
//   {a: {b: 'c'}}   => 'a:{b:"c"}'
//
function encodeParamsMap(params) {
  if (!params || typeof params !== 'object') {
    throw new Error(`params cannot be "${params}"`);
  }

  const keys = Object.keys(params).filter(function (key) {
    const val = params[key];
    return params.hasOwnProperty(key) &&
      val !== undefined &&
      // val !== null &&
      !Number.isNaN(val);
  });

  return keys.map(key => encodeParam(key, params[key]));
}

// Encodes a single parameter
//
//    ('a', 1) => 'a:1'
//
function encodeParam(key, val) {
  return `${key}:${encodeParamValue(val)}`;
}

// Encodes parameter value
//
//   'a'       => '"a"'
//   Enum('a') => 'a'
//
function encodeParamValue(value) {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return encodeParamsArray(value);
  }
  if (value instanceof _enum) {
    return value.name;
  }
  if (typeof value === 'object') {
    return encodeParamsObject(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(`unsupported param type "${typeof value}"`);
}

// default export graphqlify
export default graphqlify;
