# OrbiCloud V2 - Project Tree

## Core Source Files

```
src/
├── cmd/                    # Entry points (binaries)
│   ├── api.ts             # Starts the HTTP API server
│   └── worker.ts          # Starts the background worker
│
├── api/                    # HTTP layer
│   └── server.ts          # Express app (health + /v1/messages)
│
├── worker/                 # Background processing
│   └── worker.ts          # Postgres queue consumer
│
├── lib/                    # Infrastructure utilities
│   ├── db.ts              # PostgreSQL connection pool
│   └── logger.ts          # Simple structured logger
│
└── config/                 # Configuration
    └── index.ts           # Environment variable loader
```

## Project Root

```
orbicloud-v2/
├── migrations/             # Database schema
│   └── 001_initial_schema.sql
│
├── dist/                   # Compiled JavaScript (generated)
│
├── node_modules/           # Dependencies (generated)
│
├── package.json            # Dependencies + scripts
├── tsconfig.json           # TypeScript config
├── .env.example            # Environment template
├── .gitignore             # Git ignore rules
└── README.md              # Setup instructions
```

## File Counts

- **TypeScript files:** 7
- **Configuration files:** 3
- **Migration files:** 1
- **Total custom code:** ~400 lines

## Key Points

✅ **Two entry points** - API and worker can run independently
✅ **Zero business logic yet** - Just infrastructure skeleton
✅ **No framework magic** - Plain Express, plain Postgres
✅ **Compiles and runs** - Verified working build
