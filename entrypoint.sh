#!/bin/sh

# Push schema to database
npx prisma db push --accept-data-loss

# Start the application
node server.js
