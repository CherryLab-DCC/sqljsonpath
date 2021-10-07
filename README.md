# sqljsonpath

JavaScript implementation of the SQL/JSON path language.
Query JSON with SQL/JSON path expressions as used in PostgreSQL and other databases.

See PostgreSQL's [The SQL/JSON Path Language](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-SQLJSON-PATH) for a fuller introduction.

**Note:** This package is early in development, expect breaking changes.

## Query Example

```javascript
let cities = [
  { name: "London", "population": 8615246 },
  { name: "Berlin", "population": 3517424 },
  { name: "Madrid", "population": 3165235 },
  { name: "Rome",   "population": 2870528 }
];

import * as jp from "sqljsonpath";
let names = Array.from(jp.query(cities, '$[*].name'));

// [ "London", "Berlin", "Madrid", "Rome" ]
```

## Install

Install from npm:
```bash
$ npm install sqljsonpath
```
