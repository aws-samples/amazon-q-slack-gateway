#!/bin/bash

# Exit on error
set -e

echo "Running precheck..."
./bin/precheck.sh

echo "Setting up environment..."
./bin/environment.sh

echo "Running npm install and build..."
npm install && npm run build

echo "Running cdk bootstrap..."
cdk bootstrap -c environment=./environment.json

echo "All done!"