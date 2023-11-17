#!/bin/bash

#
# helper script called by $ROOT/init.sh - check for required packages
#

command_exists() {
    type "$1" &> /dev/null 
}

version_gt() { 
    test "$(echo "$@" | tr " " "\n" | sort -V | head -n 1)" != "$1"; 
}

extract_version() {
    echo "$1" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n 1
}

declare -A commands
commands["node"]="18.0.0"
commands["npm"]="10.2.0"
commands["tsc"]="3.8.0"
commands["esbuild"]="0.19.0"
commands["jq"]="1.5"
commands["aws"]="2.13.0"
commands["cdk"]="2.110.0"

status=0

for cmd in "${!commands[@]}"; do
    min_version=${commands[$cmd]}
    if command_exists "$cmd"; then
        installed_version=$(extract_version "$($cmd --version)")
        if version_gt $min_version $installed_version; then
            echo "$cmd v$installed_version installed, v$min_version required - NOT OK"
            status=1
        else
            echo "$cmd v$installed_version installed - OK"
        fi        
    else
        echo "$cmd is NOT installed."
        status=1
    fi
done

exit $status
