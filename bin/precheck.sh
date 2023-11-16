#!/bin/bash

#
# helper script called by $ROOT/init.sh - check for required packages
#

status=0

command_exists() {
    type "$1" &> /dev/null 
}

commands=("node" "npm" "tsc" "esbuild" "jq" "aws" "cdk")

for cmd in "${commands[@]}"; do
    if command_exists "$cmd"; then
        echo "$cmd is installed."
    else
        echo "$cmd is NOT installed."
        status=1
    fi
done

exit $status
